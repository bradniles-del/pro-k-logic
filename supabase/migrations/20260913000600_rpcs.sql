-- 0006: RPCs — the only doors to location data, plus trip and token helpers

-- ---------------------------------------------------------------------------
-- Start a trip. Only an assigned driver, on a shipment in their project,
-- with a current consent (auto mode) and an acknowledged notice.
-- ---------------------------------------------------------------------------
create or replace function public.start_trip(p_shipment_id uuid, p_mode public.tracking_mode, p_event_id uuid)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare
  s public.shipments;
  t public.trips;
  org uuid := public.auth_org_id();
begin
  select * into s from public.shipments where id = p_shipment_id;
  if not found then raise exception 'shipment not found'; end if;
  if not public.has_project_role(s.project_id, array['driver','coordinator']::public.project_role[]) then
    raise exception 'not a driver on this project';
  end if;
  if not exists (select 1 from public.shipment_assignments where shipment_id = p_shipment_id and user_id = auth.uid()) then
    raise exception 'driver is not assigned to this shipment';
  end if;
  if exists (select 1 from public.trips where shipment_id = p_shipment_id and ended_at is null) then
    raise exception 'shipment already has an active trip';
  end if;
  -- Notice must be acknowledged for the driver's own organization's jurisdiction
  if not exists (
    select 1 from public.notice_acknowledgments na
    join public.notice_versions nv on nv.id = na.notice_version_id
    where na.user_id = auth.uid()
      and nv.id = public.current_notice_version_id(org)
  ) then
    raise exception 'current notice not acknowledged' using errcode = 'P0002';
  end if;
  if p_mode = 'auto' and not exists (
    select 1 from public.consents
    where user_id = auth.uid() and kind = 'location_tracking' and revoked_at is null
  ) then
    raise exception 'location consent required for automatic mode' using errcode = 'P0003';
  end if;

  insert into public.trips (shipment_id, project_id, driver_id, mode)
    values (p_shipment_id, s.project_id, auth.uid(), p_mode)
    returning * into t;

  insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, trip_id, payload)
    values (p_event_id, s.project_id, 'shipment', p_shipment_id, 'tracking_started', auth.uid(), now(), 'qr_scan', t.id,
            jsonb_build_object('mode', p_mode));
  return t;
end $$;

-- The notice a worker of a given organization must currently acknowledge:
-- the org's own latest for its jurisdiction, else the platform default for
-- the jurisdiction, else the platform default for the country wildcard.
create or replace function public.current_notice_version_id(org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with j as (select jurisdiction from public.organizations where id = org)
  select nv.id
  from public.notice_versions nv, j
  where nv.effective_at <= now()
    and (
      (nv.organization_id = org and nv.jurisdiction = j.jurisdiction)
      or (nv.organization_id is null and nv.jurisdiction = j.jurisdiction)
      or (nv.organization_id is null and nv.jurisdiction = split_part(j.jurisdiction, '-', 1) || '-*')
    )
  order by (nv.organization_id is not null) desc,
           (nv.jurisdiction = j.jurisdiction) desc,
           nv.version desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- End a trip (driver or coordinator). Records the lifecycle event.
-- ---------------------------------------------------------------------------
create or replace function public.end_trip(p_trip_id uuid, p_reason public.trip_end_reason, p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found then raise exception 'trip not found'; end if;
  if t.driver_id <> auth.uid() and not public.has_project_role(t.project_id, array['coordinator']::public.project_role[]) then
    raise exception 'not allowed to end this trip';
  end if;
  if t.ended_at is not null then return; end if;
  insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, trip_id, payload)
    values (p_event_id, t.project_id, 'shipment', t.shipment_id, 'tracking_ended', auth.uid(), now(), 'system', p_trip_id,
            jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Ping ingestion. Validates ownership, device token, mode, and time cap.
-- pings: [{"lat":..,"lng":..,"precision_m":..,"recorded_at":".."}]
-- ---------------------------------------------------------------------------
create or replace function public.ingest_pings(p_trip_id uuid, p_device_token text, p_pings jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t public.trips;
  n integer;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found or t.driver_id <> auth.uid() then
    raise exception 'trip not found' using errcode = 'P0004';
  end if;
  if t.device_token <> p_device_token then
    raise exception 'device token mismatch' using errcode = 'P0005';
  end if;
  if t.ended_at is not null then
    raise exception 'trip has ended' using errcode = 'P0006';
  end if;
  if t.mode <> 'auto' then
    raise exception 'trip is not in automatic mode' using errcode = 'P0007';
  end if;
  if now() > t.started_at + make_interval(mins => t.max_duration_minutes) then
    -- server-side backstop; the phone should already have stopped
    insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, trip_id, payload)
      values (gen_random_uuid(), t.project_id, 'shipment', t.shipment_id, 'tracking_ended', t.driver_id, now(), 'system', t.id,
              '{"reason":"max_duration"}');
    raise exception 'trip exceeded maximum duration' using errcode = 'P0008';
  end if;

  insert into public.location_pings (trip_id, device_token, point, precision_m, recorded_at)
  select t.id, p_device_token,
         extensions.ST_SetSRID(extensions.ST_MakePoint((p ->> 'lng')::float8, (p ->> 'lat')::float8), 4326)::extensions.geography,
         nullif(p ->> 'precision_m', '')::numeric,
         (p ->> 'recorded_at')::timestamptz
  from jsonb_array_elements(p_pings) as p
  where (p ->> 'recorded_at')::timestamptz > now() - interval '2 days';
  get diagnostics n = row_count;

  update public.trips set last_ping_at = now() where id = t.id;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Reading location: coordinators/viewers go through these, and every call is
-- written to access_log. Direct SELECT on location_pings is driver-own only.
-- ---------------------------------------------------------------------------
create or replace function public.get_trip_pings(p_trip_id uuid, p_purpose public.access_purpose)
returns table (recorded_at timestamptz, lat float8, lng float8, precision_m numeric)
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found then raise exception 'trip not found'; end if;
  if t.driver_id <> auth.uid() then
    if not public.has_project_role(t.project_id, array['coordinator','viewer']::public.project_role[]) then
      raise exception 'not allowed';
    end if;
    insert into public.access_log (viewer_id, project_id, subject, subject_id, purpose)
      values (auth.uid(), t.project_id, 'trip_pings', p_trip_id, p_purpose);
  end if;
  return query
    select lp.recorded_at,
           extensions.ST_Y(lp.point::extensions.geometry),
           extensions.ST_X(lp.point::extensions.geometry),
           lp.precision_m
    from public.location_pings lp
    where lp.trip_id = p_trip_id
    order by lp.recorded_at;
end $$;

create or replace function public.get_live_positions(p_project_id uuid, p_purpose public.access_purpose)
returns table (trip_id uuid, shipment_id uuid, recorded_at timestamptz, lat float8, lng float8)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_project_role(p_project_id, array['coordinator','viewer','handler']::public.project_role[]) then
    raise exception 'not allowed';
  end if;
  insert into public.access_log (viewer_id, project_id, subject, subject_id, purpose)
    values (auth.uid(), p_project_id, 'live_position', p_project_id, p_purpose);
  return query
    select distinct on (t.id) t.id, t.shipment_id, lp.recorded_at,
           extensions.ST_Y(lp.point::extensions.geometry),
           extensions.ST_X(lp.point::extensions.geometry)
    from public.trips t
    join public.location_pings lp on lp.trip_id = t.id
    where t.project_id = p_project_id and t.ended_at is null and t.mode = 'auto'
    order by t.id, lp.recorded_at desc;
end $$;

-- What a worker can always see: who looked at their data.
create or replace function public.my_access_log()
returns setof public.access_log
language sql stable security definer set search_path = public as $$
  select al.*
  from public.access_log al
  where (al.subject = 'trip_pings' and al.subject_id in (select id from public.trips where driver_id = auth.uid()))
     or (al.subject = 'worker_history' and al.subject_id = auth.uid())
  order by al.viewed_at desc
$$;

-- ---------------------------------------------------------------------------
-- Token resolution: what a scan lands on. Members get the subject; anyone
-- with the link gets only the public summary (used by the consignee page).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  qt public.qr_tokens;
  u public.handling_units;
  r public.shipping_releases;
  visible boolean := false;
begin
  select * into qt from public.qr_tokens where token = p_token;
  if not found then return jsonb_build_object('found', false); end if;

  if qt.subject_type = 'handling_unit' then
    select * into u from public.handling_units where id = qt.subject_id;
    visible := public.unit_visible(u.id);
    return jsonb_build_object(
      'found', true, 'subject_type', 'handling_unit', 'subject_id', u.id,
      'token_version', qt.version, 'voided', qt.voided_at is not null,
      'short_code', u.short_code, 'status', u.current_status,
      'visible', visible,
      'detail', case when visible then jsonb_build_object(
        'description', u.description, 'project_id', u.current_project_id,
        'shipment_id', u.current_shipment_id, 'zone_id', u.current_zone_id) end);
  else
    select * into r from public.shipping_releases where id = qt.subject_id;
    visible := public.is_project_member(r.project_id);
    return jsonb_build_object(
      'found', true, 'subject_type', 'release', 'subject_id', r.id,
      'token_version', qt.version, 'voided', qt.voided_at is not null,
      'visible', visible,
      'detail', case when visible then jsonb_build_object(
        'number', r.number, 'project_id', r.project_id, 'supplier_org_id', r.supplier_org_id) end);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Retention: purge pings past each organization's window (driver's org) and
-- expire trips past their cap. Runs nightly.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_pings()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.location_pings lp
  using public.trips t, public.profiles p, public.organizations o
  where lp.trip_id = t.id and t.driver_id = p.id and p.organization_id = o.id
    and lp.recorded_at < now() - make_interval(days => o.retention_days_pings);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.expire_overdue_trips()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; t record;
begin
  for t in
    select * from public.trips
    where ended_at is null and now() > started_at + make_interval(mins => max_duration_minutes)
  loop
    insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, trip_id, payload)
      values (gen_random_uuid(), t.project_id, 'shipment', t.shipment_id, 'tracking_ended', t.driver_id, now(), 'system', t.id,
              '{"reason":"max_duration"}');
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('purge-expired-pings', '15 3 * * *', $$select public.purge_expired_pings()$$);
select cron.schedule('expire-overdue-trips', '*/15 * * * *', $$select public.expire_overdue_trips()$$);
