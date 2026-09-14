-- 0011 (Phase 1): SRN documents & extraction, shipment updates (chat),
-- ad-hoc location names, search indexes, storage buckets.

-- ---------------------------------------------------------------------------
-- Release lines: provenance and confirmation (extracted lines are candidates
-- until a person confirms them)
-- ---------------------------------------------------------------------------
alter table public.release_lines
  add column provenance   public.content_provenance not null default 'manual',
  add column confirmed_by uuid references public.profiles (id),
  add column confirmed_at timestamptz,
  add column source_page  integer,
  add column raw_text     text;

-- ---------------------------------------------------------------------------
-- Extraction jobs: one per document upload; result is candidate lines
-- ---------------------------------------------------------------------------
create type public.extraction_status as enum ('queued', 'running', 'done', 'failed');

create table public.extraction_jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  release_id    uuid references public.shipping_releases (id) on delete cascade,
  status        public.extraction_status not null default 'queued',
  method        text,                       -- 'heuristic' | 'llm' | 'heuristic+llm'
  pages         integer,
  candidates    jsonb not null default '[]', -- [{line_no, description, qty, uom, piece_mark, page, raw, confidence}]
  error         text,
  requested_by  uuid references public.profiles (id),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index extraction_jobs_document_idx on public.extraction_jobs (document_id);
create index extraction_jobs_release_idx on public.extraction_jobs (release_id);

-- ---------------------------------------------------------------------------
-- Shipment updates: the "chat". Short, typed, shipment-scoped. Not a stream.
-- ---------------------------------------------------------------------------
create type public.update_kind as enum (
  'delay', 'eta_change', 'departed', 'at_gate', 'offloading', 'released_driver', 'issue', 'resolved', 'note'
);

create table public.shipment_updates (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  shipment_id   uuid not null references public.shipments (id) on delete cascade,
  author_id     uuid not null references public.profiles (id),
  kind          public.update_kind not null,
  text          text not null default '' check (char_length(text) <= 140),
  eta_at        timestamptz,                -- for eta_change
  created_at    timestamptz not null default now()
);
create index shipment_updates_shipment_idx on public.shipment_updates (shipment_id, created_at desc);

create trigger shipment_updates_no_update before update on public.shipment_updates
  for each row execute function public.reject_mutation();
create trigger shipment_updates_no_delete before delete on public.shipment_updates
  for each row execute function public.reject_mutation();

-- Rate limit: one update per author per shipment per 60 seconds keeps it terse.
create or replace function public.shipment_updates_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.shipment_updates
    where shipment_id = new.shipment_id and author_id = new.author_id
      and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'one update per minute per shipment' using errcode = 'P0010';
  end if;
  return new;
end $$;
create trigger shipment_updates_before_insert before insert on public.shipment_updates
  for each row execute function public.shipment_updates_before_insert();

-- ---------------------------------------------------------------------------
-- Ad-hoc location names on events (site managers name a spot; blank if not)
-- ---------------------------------------------------------------------------
alter table public.custody_events add column location_name text;
alter table public.handling_units add column current_location_name text;
create index custody_events_location_name_idx on public.custody_events (project_id, location_name)
  where location_name is not null;

-- Keep the cached location name on the unit in sync (stored/moved events).
create or replace function public.custody_events_after_insert_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subject_type = 'handling_unit' and new.type in ('stored', 'moved', 'received', 'issued', 'installed') then
    update public.handling_units
      set current_location_name = new.location_name
      where id = new.subject_id;
  end if;
  return new;
end $$;
create trigger custody_events_after_insert_location after insert on public.custody_events
  for each row execute function public.custody_events_after_insert_location();

-- Distinct location names per project, for filters
create or replace function public.project_location_names(p_project_id uuid)
returns table (location_name text, unit_count bigint)
language sql stable security invoker set search_path = public as $$
  select current_location_name, count(*)
  from public.handling_units
  where current_project_id = p_project_id and current_location_name is not null and current_location_name <> ''
  group by current_location_name
  order by current_location_name
$$;

-- ---------------------------------------------------------------------------
-- Search: full-text on descriptions and piece marks; trigram on short codes
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

alter table public.release_lines
  add column search tsvector generated always as
    (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(piece_mark, ''))) stored;
create index release_lines_search_idx on public.release_lines using gin (search);

alter table public.unit_contents
  add column search tsvector generated always as
    (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(piece_mark, ''))) stored;
create index unit_contents_search_idx on public.unit_contents using gin (search);

alter table public.handling_units
  add column search tsvector generated always as
    (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(short_code, '') || ' ' || coalesce(current_location_name, ''))) stored;
create index handling_units_search_idx on public.handling_units using gin (search);
create index handling_units_short_code_trgm on public.handling_units using gin (short_code extensions.gin_trgm_ops);

-- "Where is it": one query for the search box.
create or replace function public.find_material(p_project_id uuid, p_query text, p_limit integer default 50)
returns table (
  unit_id uuid, short_code text, description text, status public.custody_status,
  location_name text, zone_name text, release_number text, po_number text, rank real
)
language sql stable security invoker set search_path = public as $$
  with q as (select websearch_to_tsquery('simple', p_query) as tsq)
  select u.id, u.short_code, u.description, u.current_status,
         u.current_location_name, z.name, r.number, po.number,
         greatest(
           ts_rank(u.search, q.tsq),
           coalesce((select max(ts_rank(c.search, q.tsq)) from public.unit_contents c where c.unit_id = u.id), 0)
         ) as rank
  from public.handling_units u
  cross join q
  left join public.zones z on z.id = u.current_zone_id
  left join public.shipping_releases r on r.id = u.release_id
  left join public.purchase_orders po on po.id = r.po_id
  where u.current_project_id = p_project_id
    and (
      u.search @@ q.tsq
      or u.short_code ilike '%' || p_query || '%'
      or exists (select 1 from public.unit_contents c where c.unit_id = u.id and c.search @@ q.tsq)
    )
  order by rank desc, u.updated_at desc
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------
alter table public.extraction_jobs enable row level security;
alter table public.shipment_updates enable row level security;
revoke update, delete on public.shipment_updates from anon, authenticated;

create policy extraction_select on public.extraction_jobs for select to authenticated
  using (public.is_project_member(project_id));
create policy extraction_insert on public.extraction_jobs for insert to authenticated
  with check (requested_by = auth.uid()
              and public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[]));
-- status/result written only by the edge function (service role)

create policy updates_select on public.shipment_updates for select to authenticated
  using (public.is_project_member(project_id));
create policy updates_insert on public.shipment_updates for insert to authenticated
  with check (author_id = auth.uid()
              and public.shipment_project(shipment_id) = project_id
              and public.has_project_role(project_id, array['coordinator','shipper','driver','handler']::public.project_role[]));

grant execute on function public.project_location_names(uuid) to authenticated;
grant execute on function public.find_material(uuid, text, integer) to authenticated;
revoke execute on function public.custody_events_after_insert_location() from anon;
revoke execute on function public.shipment_updates_before_insert() from anon;

-- ---------------------------------------------------------------------------
-- Storage: private buckets; paths are <project_id>/<...>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 52428800, array['application/pdf','image/jpeg','image/png']),
  ('labels',    'labels',    false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id in ('documents','labels')
         and public.is_project_member((storage.foldername(name))[1]::uuid));
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and public.has_project_role((storage.foldername(name))[1]::uuid,
                    array['coordinator','shipper','handler']::public.project_role[]));
