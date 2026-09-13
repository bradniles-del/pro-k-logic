-- 0005: status derivation, membership helpers, event side-effects

-- ---------------------------------------------------------------------------
-- Auth / membership helpers (used by RLS). SECURITY DEFINER so they can read
-- membership tables regardless of the caller's own policies.
-- ---------------------------------------------------------------------------

create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and organization_id = org and org_role = 'admin'
  )
$$;

create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members where project_id = p and user_id = auth.uid()
  )
$$;

create or replace function public.project_role_of(p uuid)
returns public.project_role language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid()
$$;

create or replace function public.has_project_role(p uuid, roles public.project_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where project_id = p and user_id = auth.uid() and role = any (roles)
  )
$$;

-- A unit is visible to members of any project it has ever belonged to.
create or replace function public.unit_visible(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.unit_projects up
    join public.project_members pm on pm.project_id = up.project_id
    where up.unit_id = u and pm.user_id = auth.uid()
  )
$$;

create or replace function public.shipment_project(s uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.shipments where id = s
$$;

-- ---------------------------------------------------------------------------
-- Which roles may record which event types
-- ---------------------------------------------------------------------------

create table public.role_event_permissions (
  role        public.project_role not null,
  event_type  public.event_type not null,
  primary key (role, event_type)
);

insert into public.role_event_permissions (role, event_type)
select 'coordinator'::public.project_role, e from unnest(enum_range(null::public.event_type)) as e
union all
select 'shipper'::public.project_role, e from unnest(array['released','assigned_to_shipment','picked_up','exception','void','correction']::public.event_type[]) as e
union all
select 'driver'::public.project_role, e from unnest(array['picked_up','tracking_started','tracking_paused','tracking_resumed','permission_lost','consent_revoked','tracking_ended','ping','border_crossed','arrived','delivered','exception','safety_checkin']::public.event_type[]) as e
union all
select 'handler'::public.project_role, e from unnest(array['received','inspected','stored','moved','split','transferred_to_project','issued','installed','exception','void','correction','assigned_to_shipment']::public.event_type[]) as e;

create or replace function public.role_may_record(p uuid, et public.event_type)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.project_members pm
    join public.role_event_permissions rep on rep.role = pm.role
    where pm.project_id = p and pm.user_id = auth.uid() and rep.event_type = et
  )
$$;

-- ---------------------------------------------------------------------------
-- Status precedence: which events set a status, and how they rank when two
-- land inside the clock-skew window.
-- ---------------------------------------------------------------------------

create table public.status_precedence (
  event_type  public.event_type primary key,
  status      public.custody_status not null,
  rank        integer not null
);

insert into public.status_precedence values
  ('released',          'released',          10),
  ('picked_up',         'picked_up',         30),
  ('tracking_started',  'in_transit',        40),
  ('arrived',           'arrived',           50),
  ('exception',         'exception',         55),
  ('delivered',         'delivered',         60),
  ('received',          'received',          70),
  ('inspected',         'received',          71),
  ('stored',            'in_storage',        80),
  ('moved',             'in_storage',        81),
  ('issued',            'issued',            90),
  ('installed',         'installed',        100);

-- Clock-skew window: two events for the same subject closer than this are
-- ordered by precedence rank instead of by device clock.
create or replace function public.skew_window()
returns interval language sql immutable as $$ select interval '10 minutes' $$;

-- Derive the current status of a subject from its non-voided events.
create or replace function public.derive_status(st public.subject_type, sid uuid)
returns table (status public.custody_status, event_id uuid, zone_id uuid, occurred_at timestamptz)
language sql stable security definer set search_path = public as $$
  with live as (
    select e.*, sp.status as sp_status, sp.rank as sp_rank
    from public.custody_events e
    join public.status_precedence sp on sp.event_type = e.type
    where e.subject_type = st and e.subject_id = sid
      and e.type <> 'void'
      and not exists (
        select 1 from public.custody_events v
        where v.type = 'void' and v.supersedes_id = e.id
      )
  ),
  latest as (
    select max(occurred_at) as t from live
  )
  select l.sp_status, l.id, l.zone_id, l.occurred_at
  from live l, latest
  where l.occurred_at >= latest.t - public.skew_window()
  order by l.sp_rank desc, l.occurred_at desc, l.received_at desc, l.id desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Event triggers: skew flag, actor org, cached status, membership events
-- ---------------------------------------------------------------------------

create or replace function public.custody_events_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.received_at is null then new.received_at := now(); end if;
  new.clock_skew_flag := abs(extract(epoch from (new.occurred_at - new.received_at))) > 600;
  if new.actor_id is not null and new.actor_org_id is null then
    select organization_id into new.actor_org_id from public.profiles where id = new.actor_id;
  end if;
  if new.type = 'void' and new.supersedes_id is null then
    raise exception 'void events must reference the event they supersede';
  end if;
  if new.type = 'tracking_paused' and new.location is not null then
    -- pauses never store a location (brief requirement 13)
    new.location := null;
    new.location_precision_m := null;
  end if;
  return new;
end $$;

create trigger custody_events_before_insert before insert on public.custody_events
  for each row execute function public.custody_events_before_insert();

create or replace function public.custody_events_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
  target_subject_type public.subject_type := new.subject_type;
  target_subject_id   uuid := new.subject_id;
  sup record;
begin
  -- Membership side-effects for units
  if new.subject_type = 'handling_unit' then
    if new.type = 'assigned_to_shipment' then
      update public.handling_units
        set current_shipment_id = (new.payload ->> 'shipment_id')::uuid
        where id = new.subject_id;
    elsif new.type = 'transferred_to_project' then
      update public.unit_projects set left_at = new.occurred_at
        where unit_id = new.subject_id and left_at is null;
      insert into public.unit_projects (unit_id, project_id, from_event_id, entered_at)
        values (new.subject_id, (new.payload ->> 'project_id')::uuid, new.id, new.occurred_at);
      update public.handling_units
        set current_project_id = (new.payload ->> 'project_id')::uuid
        where id = new.subject_id;
    end if;
  end if;

  -- Trip bookkeeping
  if new.trip_id is not null then
    if new.type = 'arrived' then
      update public.trips set arrived_at = coalesce(arrived_at, new.occurred_at) where id = new.trip_id;
    elsif new.type = 'delivered' then
      update public.trips
        set delivered_at = coalesce(delivered_at, new.occurred_at),
            ended_at = coalesce(ended_at, new.occurred_at),
            end_reason = coalesce(end_reason, 'delivered')
        where id = new.trip_id;
    elsif new.type = 'tracking_ended' then
      update public.trips
        set ended_at = coalesce(ended_at, new.occurred_at),
            end_reason = coalesce(end_reason, nullif(new.payload ->> 'reason', '')::public.trip_end_reason, 'driver_ended')
        where id = new.trip_id;
    elsif new.type in ('permission_lost', 'consent_revoked') then
      update public.trips set mode = 'manual' where id = new.trip_id and ended_at is null;
    end if;
  end if;

  -- A void re-derives the superseded event's subject, not its own row
  if new.type = 'void' then
    select subject_type, subject_id into sup from public.custody_events where id = new.supersedes_id;
    if found then
      target_subject_type := sup.subject_type;
      target_subject_id := sup.subject_id;
    end if;
  end if;

  -- Recompute cached status
  select * into d from public.derive_status(target_subject_type, target_subject_id);
  if target_subject_type = 'shipment' then
    update public.shipments
      set current_status = coalesce(d.status, 'released'), status_event_id = d.event_id
      where id = target_subject_id;
  else
    update public.handling_units
      set current_status = coalesce(d.status, 'released'),
          status_event_id = d.event_id,
          current_zone_id = coalesce(d.zone_id, current_zone_id)
      where id = target_subject_id;
  end if;
  return new;
end $$;

create trigger custody_events_after_insert after insert on public.custody_events
  for each row execute function public.custody_events_after_insert();

-- New units start their project history
create or replace function public.handling_units_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.unit_projects (unit_id, project_id, entered_at)
    values (new.id, new.current_project_id, new.created_at);
  return new;
end $$;
create trigger handling_units_after_insert after insert on public.handling_units
  for each row execute function public.handling_units_after_insert();

-- Every release and unit gets a QR token on creation
create or replace function public.mint_token_for_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.qr_tokens (subject_type, subject_id, created_by) values ('release', new.id, new.issued_by);
  return new;
end $$;
create trigger shipping_releases_mint_token after insert on public.shipping_releases
  for each row execute function public.mint_token_for_release();

create or replace function public.mint_token_for_unit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.qr_tokens (subject_type, subject_id, created_by) values ('handling_unit', new.id, new.created_by);
  return new;
end $$;
create trigger handling_units_mint_token after insert on public.handling_units
  for each row execute function public.mint_token_for_unit();
