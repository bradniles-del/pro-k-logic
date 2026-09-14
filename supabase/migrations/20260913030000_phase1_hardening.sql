-- Phase 1 hardening: cross-project consistency for extraction jobs and
-- documents, requester clean-up of stuck jobs, and a safe storage folder cast.

-- ---------------------------------------------------------------------------
-- a. extraction_jobs insert: the document (and release) must belong to project_id
-- ---------------------------------------------------------------------------
drop policy if exists extraction_insert on public.extraction_jobs;
create policy extraction_insert on public.extraction_jobs for insert to authenticated
  with check (
    requested_by = auth.uid()
    and public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[])
    and (select d.project_id from public.documents d where d.id = document_id) = project_id
    and (release_id is null
         or (select r.project_id from public.shipping_releases r where r.id = release_id) = project_id)
  );

-- ---------------------------------------------------------------------------
-- b. requesters may delete their own queued/failed jobs (stuck-job clean-up)
-- ---------------------------------------------------------------------------
drop policy if exists extraction_delete on public.extraction_jobs;
create policy extraction_delete on public.extraction_jobs for delete to authenticated
  using (requested_by = auth.uid() and status in ('queued','failed'));

-- ---------------------------------------------------------------------------
-- c. safe storage folder cast: first path segment as uuid, or null
-- ---------------------------------------------------------------------------
create or replace function public.storage_project_id(name text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid
    else null
  end
$$;
revoke execute on function public.storage_project_id(text) from public, anon;
grant execute on function public.storage_project_id(text) to authenticated, service_role;

drop policy if exists documents_read on storage.objects;
drop policy if exists documents_write on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id in ('documents','labels')
         and public.is_project_member(public.storage_project_id(name)));
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and public.has_project_role(public.storage_project_id(name),
                    array['coordinator','shipper','handler']::public.project_role[]));

-- ---------------------------------------------------------------------------
-- d. documents: release (when set) must belong to the same project
-- ---------------------------------------------------------------------------
create or replace function public.documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release_project uuid;
begin
  if new.release_id is not null then
    select r.project_id into v_release_project
      from public.shipping_releases r where r.id = new.release_id;
    if v_release_project is null or v_release_project <> new.project_id then
      raise exception 'document release does not belong to project %', new.project_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.documents_before_insert() from public, anon, authenticated;

drop trigger if exists documents_before_insert on public.documents;
create trigger documents_before_insert
  before insert or update of release_id, project_id on public.documents
  for each row execute function public.documents_before_insert();
