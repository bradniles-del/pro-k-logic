-- 0004: notices, consents, access log, incidents

-- Versioned notice text per jurisdiction (and optionally per organization).
create table public.notice_versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations (id) on delete cascade,  -- null = platform default
  jurisdiction     text not null,                     -- 'CA-AB', 'CA-*', 'US-CA', 'US-*'
  version          integer not null,
  title            text not null,
  body_md          text not null,
  -- Purposes named in this notice. Lone-worker safety is NOT listed until decided.
  purposes         text[] not null default array['shipment_status', 'proof_of_delivery', 'arrival_notification'],
  effective_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (organization_id, jurisdiction, version)
);

create table public.notice_acknowledgments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  notice_version_id  uuid not null references public.notice_versions (id),
  acknowledged_at    timestamptz not null default now(),
  unique (user_id, notice_version_id)
);

-- Explicit, revocable consent. statement_text is what the person actually saw.
create table public.consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id),
  kind             public.consent_kind not null,
  statement_text   text not null,
  owns_device      boolean,
  owns_vehicle     boolean,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, kind) where revoked_at is null;

-- Every dashboard read of location or worker history. Append-only.
create table public.access_log (
  id               bigint generated always as identity primary key,
  viewer_id        uuid not null references public.profiles (id),
  project_id       uuid not null references public.projects (id),
  subject          public.access_subject not null,
  subject_id       uuid not null,       -- trip id or worker id
  purpose          public.access_purpose not null,
  viewed_at        timestamptz not null default now()
);
create index access_log_subject_idx on public.access_log (subject, subject_id, viewed_at desc);
create trigger access_log_no_update before update on public.access_log
  for each row execute function public.reject_mutation();
create trigger access_log_no_delete before delete on public.access_log
  for each row execute function public.reject_mutation();

-- Privacy incidents (PIPEDA s.10.3 requires a record of every breach).
create table public.incidents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  reported_by      uuid references public.profiles (id),
  summary          text not null,
  occurred_at      timestamptz,
  discovered_at    timestamptz not null default now(),
  -- Real risk of significant harm assessment, structured
  harm_assessment  jsonb not null default '{}',
  affected_projects uuid[] not null default '{}',
  status           public.incident_status not null default 'open',
  reported_to_commissioner_at timestamptz,
  individuals_notified_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger incidents_touch before update on public.incidents
  for each row execute function public.touch_updated_at();
