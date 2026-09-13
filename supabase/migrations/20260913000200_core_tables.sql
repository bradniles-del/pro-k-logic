-- 0002: core tables (organizations, people, projects, zones, procurement, releases)

-- ---------------------------------------------------------------------------
-- Organizations and people
-- ---------------------------------------------------------------------------

create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             public.org_kind not null default 'other',
  -- ISO 3166-2 style, e.g. 'CA-AB', 'US-CA'. Drives which notice a worker sees.
  jurisdiction     text not null default 'CA-AB',
  is_placeholder   boolean not null default false,
  contact_email    text,
  claimed_at       timestamptz,
  hosting_region   text not null default 'ca-central-1',
  -- Retention: raw location pings (days) and custody events (days, null = keep)
  retention_days_pings  integer not null default 90 check (retention_days_pings between 1 and 3650),
  retention_days_events integer check (retention_days_events is null or retention_days_events >= 30),
  dpa_signed_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  organization_id  uuid references public.organizations (id),
  org_role         public.org_role not null default 'member',
  full_name        text not null default '',
  phone_e164       text,
  locale           text not null default 'en-CA',
  -- Set when a departed worker is pseudonymised; original identity is gone.
  pseudonymised_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects: the sharing boundary
-- ---------------------------------------------------------------------------

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_org_id     uuid not null references public.organizations (id),
  name             text not null,
  code             text,
  timezone         text not null default 'America/Edmonton',
  site_point       extensions.geography(point, 4326),
  -- Approach rings from the gate, evaluated server-side against trip pings.
  approach_rings   jsonb not null default '[{"km": 40, "label": "40 km out"}, {"km": 8, "label": "8 km out"}, {"km": 0.5, "label": "at gate", "gate": true}]',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Which organizations participate in a project (owner, suppliers, carriers).
create table public.project_organizations (
  project_id       uuid not null references public.projects (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id),
  invited_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  primary key (project_id, organization_id)
);

-- Per-user, per-project role. This is what RLS keys on.
create table public.project_members (
  project_id       uuid not null references public.projects (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             public.project_role not null,
  created_at       timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- Email invitations that bind on first sign-in (placeholder orgs claim this way).
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id),
  email            text not null,
  role             public.project_role not null,
  token            text not null unique default public.random_token(24),
  invited_by       uuid references public.profiles (id),
  accepted_by      uuid references public.profiles (id),
  accepted_at      timestamptz,
  expires_at       timestamptz not null default now() + interval '14 days',
  created_at       timestamptz not null default now()
);

-- Named places on a site. On-site pings snap to these.
create table public.zones (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text not null,
  kind             text not null default 'laydown',   -- yard, laydown, staging, install, gate, other
  center           extensions.geography(point, 4326) not null,
  radius_m         numeric(8,1) not null default 50,
  polygon          extensions.geography(polygon, 4326),
  created_at       timestamptz not null default now(),
  unique (project_id, name)
);
create index zones_project_idx on public.zones (project_id);

-- Who gets approach notifications, and for which zones.
create table public.notification_roster (
  project_id       uuid not null references public.projects (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  zone_id          uuid references public.zones (id) on delete cascade,
  approach_rings   boolean not null default true,
  exceptions       boolean not null default true,
  primary key (project_id, user_id, zone_id)
);

create table public.push_tokens (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  expo_token       text not null,
  platform         text not null check (platform in ('ios', 'android', 'web')),
  created_at       timestamptz not null default now(),
  primary key (user_id, expo_token)
);

-- ---------------------------------------------------------------------------
-- Procurement
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  supplier_org_id  uuid references public.organizations (id),
  number           text not null,
  currency         char(3) not null default 'CAD',
  issued_at        date,
  notes            text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (project_id, number)
);

create table public.po_lines (
  id               uuid primary key default gen_random_uuid(),
  po_id            uuid not null references public.purchase_orders (id) on delete cascade,
  line_no          integer not null,
  description      text not null,
  qty              numeric(14,3) not null default 1,
  uom              text not null default 'ea',
  unit_price       numeric(14,4),
  currency         char(3),
  piece_mark       text,
  unique (po_id, line_no)
);

-- ---------------------------------------------------------------------------
-- Shipping releases: where the QR is born
-- ---------------------------------------------------------------------------

create table public.shipping_releases (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  supplier_org_id  uuid not null references public.organizations (id),
  po_id            uuid references public.purchase_orders (id),
  number           text not null,
  supplier_ref     text,
  issued_at        timestamptz not null default now(),
  issued_by        uuid references public.profiles (id),
  notes            text,
  created_at       timestamptz not null default now(),
  unique (project_id, supplier_org_id, number)
);
create index shipping_releases_project_idx on public.shipping_releases (project_id);

create table public.release_lines (
  id               uuid primary key default gen_random_uuid(),
  release_id       uuid not null references public.shipping_releases (id) on delete cascade,
  po_line_id       uuid references public.po_lines (id),
  line_no          integer not null,
  description      text not null,
  qty              numeric(14,3) not null default 1,
  uom              text not null default 'ea',
  piece_mark       text,
  unique (release_id, line_no)
);

-- Files: packing lists, BOLs, MTRs, drawings, customs paperwork.
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  release_id       uuid references public.shipping_releases (id) on delete cascade,
  kind             public.document_kind not null default 'other',
  storage_path     text not null,
  filename         text not null,
  mime_type        text,
  uploaded_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index documents_release_idx on public.documents (release_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
