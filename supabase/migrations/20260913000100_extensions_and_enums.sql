-- Pro-K-Logic — Phase 0
-- 0001: extensions and enumerated types
--
-- Everything in this schema follows the architecture plan: append-only custody
-- events over a small set of physical things, project as the sharing boundary,
-- and automatic phone location confined to trips.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pgtap with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.org_kind as enum ('contractor', 'owner', 'supplier', 'carrier', 'other');

create type public.org_role as enum ('admin', 'member');

-- Per-project roles. A user can hold different roles on different projects.
create type public.project_role as enum ('coordinator', 'shipper', 'driver', 'handler', 'viewer');

create type public.subject_type as enum ('shipment', 'handling_unit');

create type public.tracking_mode as enum ('manual', 'auto');

create type public.trip_end_reason as enum (
  'delivered', 'cancelled', 'max_duration', 'stationary', 'permission_lost', 'consent_revoked', 'driver_ended'
);

-- The passport stamps. Order here has no meaning; precedence lives in a table.
create type public.event_type as enum (
  -- release and assignment
  'released', 'assigned_to_shipment',
  -- transport
  'picked_up', 'tracking_started', 'tracking_paused', 'tracking_resumed',
  'permission_lost', 'consent_revoked', 'tracking_ended',
  'ping', 'approach_ring_crossed', 'border_crossed', 'arrived', 'delivered',
  -- site
  'received', 'inspected', 'stored', 'moved', 'split', 'transferred_to_project',
  'issued', 'installed',
  -- control
  'exception', 'void', 'correction',
  -- reserved (lone-worker decision pending)
  'safety_checkin'
);

create type public.event_source as enum ('qr_scan', 'manual_ping', 'auto_ping', 'geofence', 'dashboard', 'system');

-- Cached, derived status on shipments and units. Derived from events only.
create type public.custody_status as enum (
  'released', 'ready_for_pickup', 'picked_up', 'in_transit', 'arrived', 'delivered',
  'received', 'in_storage', 'issued', 'installed', 'exception'
);

create type public.content_provenance as enum ('structured', 'manual', 'extracted');

create type public.evidence_kind as enum ('photo', 'signature', 'form', 'document');

create type public.document_kind as enum ('packing_list', 'bill_of_lading', 'mtr', 'drawing', 'customs', 'other');

create type public.consent_kind as enum ('location_tracking');

create type public.access_purpose as enum (
  'shipment_status', 'proof_of_delivery', 'exception_investigation', 'worker_request', 'safety', 'support'
);

create type public.access_subject as enum ('trip_pings', 'worker_history', 'live_position');

create type public.incident_status as enum ('open', 'assessed', 'reported', 'closed');

-- ---------------------------------------------------------------------------
-- Helpers needed by column defaults in later migrations
-- ---------------------------------------------------------------------------

-- URL-safe random token. (encode(..., 'base64url') is PostgreSQL 18+; this
-- project runs 17, so emulate it.)
create or replace function public.random_token(n_bytes integer default 16)
returns text language sql volatile as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(n_bytes), 'base64'), '='), '+/', '-_')
$$;
