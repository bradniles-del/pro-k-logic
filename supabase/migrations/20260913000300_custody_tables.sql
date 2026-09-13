-- 0003: shipments, handling units, tokens, trips, custody events, evidence, pings

-- ---------------------------------------------------------------------------
-- Shipments and handling units
-- ---------------------------------------------------------------------------

create table public.shipments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  release_id           uuid references public.shipping_releases (id),
  split_from_id        uuid references public.shipments (id),
  carrier_org_id       uuid references public.organizations (id),
  origin_text          text,
  origin_point         extensions.geography(point, 4326),
  destination_zone_id  uuid references public.zones (id),
  destination_point    extensions.geography(point, 4326),
  planned_pickup_at    timestamptz,
  planned_delivery_at  timestamptz,
  -- cached, derived from events
  current_status       public.custody_status not null default 'released',
  status_event_id      uuid,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index shipments_project_idx on public.shipments (project_id);
create index shipments_release_idx on public.shipments (release_id);
create trigger shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

-- Drivers assigned to a shipment. Only an assigned driver may start a trip.
create table public.shipment_assignments (
  shipment_id      uuid not null references public.shipments (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  assigned_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  primary key (shipment_id, user_id)
);

create table public.handling_units (
  id                   uuid primary key default gen_random_uuid(),
  release_id           uuid references public.shipping_releases (id),
  parent_unit_id       uuid references public.handling_units (id),   -- set by a split
  kind                 text not null default 'crate',   -- crate, bundle, skid, spool, piece, module, other
  description          text not null default '',
  weight_kg            numeric(10,2),
  length_m             numeric(8,3),
  width_m              numeric(8,3),
  height_m             numeric(8,3),
  -- human-readable, marker-friendly; see short_code generator below
  short_code           text not null unique,
  -- cached, derived from events (membership is event-driven)
  current_project_id   uuid not null references public.projects (id),
  current_shipment_id  uuid references public.shipments (id),
  current_status       public.custody_status not null default 'released',
  current_zone_id      uuid references public.zones (id),
  status_event_id      uuid,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index handling_units_project_idx on public.handling_units (current_project_id);
create index handling_units_shipment_idx on public.handling_units (current_shipment_id);
create trigger handling_units_touch before update on public.handling_units
  for each row execute function public.touch_updated_at();

-- Every project a unit has ever belonged to. Read access follows this table;
-- write access follows current_project_id.
create table public.unit_projects (
  unit_id          uuid not null references public.handling_units (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  from_event_id    uuid,
  entered_at       timestamptz not null default now(),
  left_at          timestamptz,
  primary key (unit_id, project_id, entered_at)
);
create index unit_projects_project_idx on public.unit_projects (project_id);

create table public.unit_contents (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.handling_units (id) on delete cascade,
  release_line_id  uuid references public.release_lines (id),
  po_line_id       uuid references public.po_lines (id),
  description      text not null,
  qty              numeric(14,3) not null default 1,
  uom              text not null default 'ea',
  piece_mark       text,
  provenance       public.content_provenance not null default 'manual',
  confirmed_by     uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index unit_contents_unit_idx on public.unit_contents (unit_id);

-- ---------------------------------------------------------------------------
-- QR tokens: opaque, unguessable, versioned
-- ---------------------------------------------------------------------------

create table public.qr_tokens (
  id               uuid primary key default gen_random_uuid(),
  token            text not null unique default public.random_token(16),
  subject_type     text not null check (subject_type in ('release', 'handling_unit')),
  subject_id       uuid not null,
  version          integer not null default 1,
  voided_at        timestamptz,
  reprint_reason   text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (subject_type, subject_id, version)
);
create index qr_tokens_subject_idx on public.qr_tokens (subject_type, subject_id);

-- Short codes: 8 chars from an alphabet without 0/O/1/I/L, shown as PKL-XXXX-XXXX.
create or replace function public.generate_short_code()
returns text language plpgsql as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'PKL-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
end $$;

create or replace function public.set_unit_short_code()
returns trigger language plpgsql as $$
begin
  if new.short_code is null or new.short_code = '' then
    loop
      new.short_code := public.generate_short_code();
      exit when not exists (select 1 from public.handling_units where short_code = new.short_code);
    end loop;
  end if;
  return new;
end $$;

-- BEFORE INSERT runs before NOT NULL is checked, so inserts may omit short_code.
create trigger handling_units_short_code before insert on public.handling_units
  for each row execute function public.set_unit_short_code();

-- ---------------------------------------------------------------------------
-- Trips: the only thing that can own automatic phone location
-- ---------------------------------------------------------------------------

create table public.trips (
  id                     uuid primary key default gen_random_uuid(),
  shipment_id            uuid not null references public.shipments (id) on delete cascade,
  project_id             uuid not null references public.projects (id) on delete cascade,
  driver_id              uuid not null references public.profiles (id),
  mode                   public.tracking_mode not null,
  device_token           text not null default public.random_token(12),
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  end_reason             public.trip_end_reason,
  max_duration_minutes   integer not null default 840,   -- 14 h, enforced on the phone too
  arrived_at             timestamptz,                    -- wait clock start
  delivered_at           timestamptz,                    -- wait clock stop
  last_ping_at           timestamptz,
  -- reserved for the lone-worker decision; null = feature off
  checkin_interval_minutes integer,
  created_at             timestamptz not null default now()
);
create index trips_shipment_idx on public.trips (shipment_id);
create index trips_driver_idx on public.trips (driver_id);
create index trips_active_idx on public.trips (project_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- Custody events: append-only passport
-- ---------------------------------------------------------------------------

create table public.custody_events (
  id                   uuid primary key,                        -- client-generated UUIDv7
  project_id           uuid not null references public.projects (id),
  subject_type         public.subject_type not null,
  subject_id           uuid not null,
  type                 public.event_type not null,
  actor_id             uuid references public.profiles (id),
  actor_org_id         uuid references public.organizations (id),
  occurred_at          timestamptz not null,
  occurred_tz          text,
  received_at          timestamptz not null default now(),
  source               public.event_source not null default 'dashboard',
  location             extensions.geography(point, 4326),
  location_precision_m numeric(8,1),
  zone_id              uuid references public.zones (id),
  trip_id              uuid references public.trips (id),
  token_version        integer,
  token_was_voided     boolean not null default false,
  notes                text,
  payload              jsonb not null default '{}',
  supersedes_id        uuid references public.custody_events (id),   -- for void
  replaces_with_id     uuid references public.custody_events (id),   -- for void → replacement
  clock_skew_flag      boolean not null default false,
  created_at           timestamptz not null default now()
);
create index custody_events_subject_idx on public.custody_events (subject_type, subject_id, occurred_at);
create index custody_events_project_idx on public.custody_events (project_id, occurred_at desc);
create index custody_events_trip_idx on public.custody_events (trip_id) where trip_id is not null;
create index custody_events_actor_idx on public.custody_events (actor_id);

-- Append-only: no UPDATE or DELETE, ever, for anyone below superuser.
create or replace function public.reject_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'custody_events is append-only; record a void/correction event instead'
    using errcode = 'P0001';
end $$;
create trigger custody_events_no_update before update on public.custody_events
  for each row execute function public.reject_mutation();
create trigger custody_events_no_delete before delete on public.custody_events
  for each row execute function public.reject_mutation();

-- ---------------------------------------------------------------------------
-- Evidence: photos, signatures, forms; linkable to many events
-- ---------------------------------------------------------------------------

create table public.evidence (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  kind             public.evidence_kind not null,
  storage_path     text,
  form_data        jsonb,
  captured_by      uuid references public.profiles (id),
  captured_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table public.event_evidence (
  event_id         uuid not null references public.custody_events (id),
  evidence_id      uuid not null references public.evidence (id) on delete cascade,
  primary key (event_id, evidence_id)
);

-- Per-project, per-event-type form definitions (receiving checklist, damage report).
create table public.form_definitions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  event_type       public.event_type not null,
  name             text not null,
  schema           jsonb not null,      -- JSON schema of fields
  required         boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (project_id, event_type, name)
);

-- ---------------------------------------------------------------------------
-- Location pings: automatic trips only; NO user column by design
-- ---------------------------------------------------------------------------

create table public.location_pings (
  id               bigint generated always as identity primary key,
  trip_id          uuid not null references public.trips (id) on delete cascade,
  device_token     text not null,
  point            extensions.geography(point, 4326) not null,
  precision_m      numeric(8,1),
  recorded_at      timestamptz not null,
  received_at      timestamptz not null default now()
);
create index location_pings_trip_idx on public.location_pings (trip_id, recorded_at desc);

create trigger location_pings_no_update before update on public.location_pings
  for each row execute function public.reject_mutation();
