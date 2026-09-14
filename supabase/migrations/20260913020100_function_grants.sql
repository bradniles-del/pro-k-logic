-- 0012: function privileges done right.
-- Migration 0010 revoked from `anon`, but every function still carried the
-- default PUBLIC grant, which anon and authenticated inherit. Strip PUBLIC and
-- grant explicitly.

alter default privileges in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- Signed-in RPC surface
grant execute on function public.create_organization(text, public.org_kind, text)     to authenticated;
grant execute on function public.create_project(text, text, text, float8, float8)     to authenticated;
grant execute on function public.accept_invitation(text)                             to authenticated;
grant execute on function public.current_notice_version_id(uuid)                     to authenticated;
grant execute on function public.start_trip(uuid, public.tracking_mode, uuid)        to authenticated;
grant execute on function public.end_trip(uuid, public.trip_end_reason, uuid)        to authenticated;
grant execute on function public.ingest_pings(uuid, text, jsonb)                     to authenticated;
grant execute on function public.get_trip_pings(uuid, public.access_purpose)         to authenticated;
grant execute on function public.get_live_positions(uuid, public.access_purpose)     to authenticated;
grant execute on function public.my_access_log()                                     to authenticated;
grant execute on function public.derive_status(public.subject_type, uuid)            to authenticated;
grant execute on function public.project_location_names(uuid)                        to authenticated;
grant execute on function public.find_material(uuid, text, integer)                  to authenticated;
grant execute on function public.resolve_token(text)                                 to anon, authenticated;

-- Helpers referenced by RLS policies (evaluated as the calling role)
grant execute on function public.auth_org_id()                                       to authenticated;
grant execute on function public.is_org_admin(uuid)                                  to authenticated;
grant execute on function public.is_project_member(uuid)                             to authenticated;
grant execute on function public.project_role_of(uuid)                               to authenticated;
grant execute on function public.has_project_role(uuid, public.project_role[])       to authenticated;
grant execute on function public.unit_visible(uuid)                                  to authenticated;
grant execute on function public.shipment_project(uuid)                              to authenticated;
grant execute on function public.role_may_record(uuid, public.event_type)            to authenticated;

-- Functions evaluated in the inserting user's context (column defaults and
-- non-definer trigger bodies)
grant execute on function public.random_token(integer)                               to authenticated;
grant execute on function public.generate_short_code()                               to authenticated;
grant execute on function public.set_unit_short_code()                               to authenticated;
grant execute on function public.touch_updated_at()                                  to authenticated;
grant execute on function public.reject_mutation()                                   to authenticated;
grant execute on function public.skew_window()                                       to authenticated;

-- Storage policies call is_project_member/has_project_role as the storage role too
grant execute on function public.is_project_member(uuid)                             to service_role;
grant execute on function public.has_project_role(uuid, public.project_role[])       to service_role;
grant execute on all functions in schema public                                      to service_role;
