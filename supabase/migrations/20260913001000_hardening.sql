-- 0010: security-advisor hardening
--   * pin search_path on every remaining function
--   * anon gets no RPC surface except resolve_token (the consignee scan page)
--   * cron/maintenance functions are not callable by signed-in users
--
-- Trigger functions are left executable by authenticated: PostgREST cannot
-- usefully call a function returning `trigger`, and column defaults / triggers
-- are evaluated in the inserting user's context, so revoking would break inserts.

alter function public.touch_updated_at()        set search_path = public;
alter function public.generate_short_code()     set search_path = public;
alter function public.set_unit_short_code()     set search_path = public;
alter function public.reject_mutation()         set search_path = public;
alter function public.skew_window()             set search_path = public;
alter function public.random_token(integer)     set search_path = public, extensions;

-- anon: nothing except the public token resolver
alter default privileges in schema public revoke execute on functions from anon;
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;
grant execute on function public.resolve_token(text) to anon;

-- authenticated: no maintenance jobs
revoke execute on function public.purge_expired_pings()  from authenticated;
revoke execute on function public.expire_overdue_trips() from authenticated;
