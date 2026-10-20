-- Explicit Data API grants for every table in public.
--
-- Why: from 2026-10-30 Supabase no longer auto-grants anon / authenticated /
-- service_role on new objects in "public". Existing objects on the live
-- project keep their grants, but any migration chain replayed from scratch
-- (supabase db reset, a preview branch, a brand-new project) would leave
-- every table unreachable through supabase-js / PostgREST.
--
-- This migration reproduces the grants the live project has today (taken
-- from pg_catalog on 2026-10-20), so a fresh replay ends in the same state
-- production is in. The earlier hardening migrations already *revoke* the
-- privileges client roles must not have; this file supplies the baseline
-- those revokes assumed was there. It is idempotent.
--
-- Row Level Security still gates what each role can actually read or write;
-- these grants only decide whether the Data API may touch the table at all.
--
-- Going forward: every migration that creates a table or view must grant on
-- it in the same file. Copy the block at the bottom of this file.

do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    -- table, client privileges (anon + authenticated), client roles
    --
    -- 1. Fully exposed to the API (RLS does the gating)
    ['consents',                   'select, insert, update, delete', 'anon, authenticated'],
    ['dispatch_setting_changes',   'select, insert, update, delete', 'anon, authenticated'],
    ['documents',                  'select, insert, update, delete', 'anon, authenticated'],
    ['event_evidence',             'select, insert, update, delete', 'anon, authenticated'],
    ['evidence',                   'select, insert, update, delete', 'anon, authenticated'],
    ['extraction_jobs',            'select, insert, update, delete', 'anon, authenticated'],
    ['form_definitions',           'select, insert, update, delete', 'anon, authenticated'],
    ['handling_units',             'select, insert, update, delete', 'anon, authenticated'],
    ['incidents',                  'select, insert, update, delete', 'anon, authenticated'],
    ['invitations',                'select, insert, update, delete', 'anon, authenticated'],
    ['notice_versions',            'select, insert, update, delete', 'anon, authenticated'],
    ['notification_preferences',   'select, insert, update, delete', 'anon, authenticated'],
    ['notification_roster',        'select, insert, update, delete', 'anon, authenticated'],
    ['organizations',              'select, insert, update, delete', 'anon, authenticated'],
    ['po_lines',                   'select, insert, update, delete', 'anon, authenticated'],
    ['profiles',                   'select, insert, update, delete', 'anon, authenticated'],
    ['project_members',            'select, insert, update, delete', 'anon, authenticated'],
    ['project_organizations',      'select, insert, update, delete', 'anon, authenticated'],
    ['projects',                   'select, insert, update, delete', 'anon, authenticated'],
    ['purchase_orders',            'select, insert, update, delete', 'anon, authenticated'],
    ['push_tokens',                'select, insert, update, delete', 'anon, authenticated'],
    ['qr_tokens',                  'select, insert, update, delete', 'anon, authenticated'],
    ['receiving_hours',            'select, insert, update, delete', 'anon, authenticated'],
    ['receiving_hours_exceptions', 'select, insert, update, delete', 'anon, authenticated'],
    ['release_lines',              'select, insert, update, delete', 'anon, authenticated'],
    ['shipment_assignments',       'select, insert, update, delete', 'anon, authenticated'],
    ['shipments',                  'select, insert, update, delete', 'anon, authenticated'],
    ['shipping_releases',          'select, insert, update, delete', 'anon, authenticated'],
    ['stamp_placements',           'select, insert, update, delete', 'anon, authenticated'],
    ['tracking_link_views',        'select, insert, update, delete', 'anon, authenticated'],
    ['tracking_links',             'select, insert, update, delete', 'anon, authenticated'],
    ['trips',                      'select, insert, update, delete', 'anon, authenticated'],
    ['unit_contents',              'select, insert, update, delete', 'anon, authenticated'],
    ['unit_projects',              'select, insert, update, delete', 'anon, authenticated'],
    ['zones',                      'select, insert, update, delete', 'anon, authenticated'],
    --
    -- 2. Append-only for clients (custody / audit trails: no update, no delete)
    ['access_log',                 'select, insert',                 'anon, authenticated'],
    ['custody_events',             'select, insert',                 'anon, authenticated'],
    ['location_pings',             'select, insert',                 'anon, authenticated'],
    ['notice_acknowledgments',     'select, insert',                 'anon, authenticated'],
    ['shipment_updates',           'select, insert',                 'anon, authenticated'],
    --
    -- 3. Reference tables: read-only for clients
    ['role_event_permissions',     'select',                         'anon, authenticated'],
    ['status_precedence',          'select',                         'anon, authenticated'],
    --
    -- 4. One-off shapes
    -- notifications: clients may mark read/dismissed but never delete
    ['notifications',              'select, insert, update',         'anon, authenticated'],
    -- pod_signatures: signatures are immutable once captured
    ['pod_signatures',             'select, insert, delete',         'anon, authenticated'],
    -- receiving: signed-in users only, no anon surface
    ['shipment_receipts',          'select, insert, update, delete', 'authenticated'],
    ['receipt_lines',              'select, insert, update, delete', 'authenticated'],
    ['receipt_amendments',         'select',                         'authenticated']
  ]
  loop
    if to_regclass('public.' || spec[1]) is null then
      -- Tolerated so the file applies on a checkout that is behind the live
      -- migration chain; the missing table's own migration must carry its grants.
      raise notice 'explicit_table_grants: public.% not present, skipped', spec[1];
      continue;
    end if;
    -- client roles get exactly what production has today
    execute format('grant %s on public.%I to %s', spec[2], spec[1], spec[3]);
    -- service_role always has full access
    execute format('grant select, insert, update, delete on public.%I to service_role', spec[1]);
  end loop;
end $$;

-- Sequences (access_log_id_seq, location_pings_id_seq, tracking_link_views_id_seq)
-- intentionally get no client grants: inserts into those tables go through
-- security-definer RPCs. Matches the live project.

-- ---------------------------------------------------------------------------
-- Template for future migrations — put this right after each create table:
--
--   grant select                         on public.<table> to anon;        -- only if logged-out users need it
--   grant select, insert, update, delete on public.<table> to authenticated;
--   grant select, insert, update, delete on public.<table> to service_role;
--   alter table public.<table> enable row level security;
--   -- ...then the policies
--
-- Trim the privilege list to what the table actually needs (append-only
-- tables: select, insert; reference tables: select).
-- If the table uses a serial/bigserial column (not uuid or identity), also:
--   grant usage, select on sequence public.<table>_id_seq to authenticated, service_role;
-- ---------------------------------------------------------------------------
