-- Pro-K-Logic RLS isolation tests (pgTAP)
-- Run locally:  supabase test db
-- Run remotely: paste into execute_sql wrapped in begin; ... rollback;
--
-- Scenario: Acme Contractors owns project "Site A". Steelco (supplier) and
-- Haulit (carrier) are invited. Rival Corp is a third organization that is
-- NOT on the project and must see nothing.

begin;
create schema if not exists tests;
-- tests.as_user() is called while already impersonating an authenticated user
grant usage on schema tests to authenticated;
select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures: users, orgs, project, memberships (as superuser)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','coord@acme.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Casey Coordinator"}',now(),now()),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','ship@steelco.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Sam Shipper"}',now(),now()),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','dan@haulit.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Dan Driver"}',now(),now()),
  ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','hank@acme.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Hank Handler"}',now(),now()),
  ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','rival@rival.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Rae Rival"}',now(),now()),
  ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','dave@haulit.test','authenticated','authenticated','x',now(),'{}','{"full_name":"Dave Driver Two"}',now(),now());

insert into public.organizations (id, name, kind, jurisdiction) values
  ('10000000-0000-0000-0000-000000000001','Acme Contractors','contractor','CA-AB'),
  ('10000000-0000-0000-0000-000000000002','Steelco Fabrication','supplier','US-TX'),
  ('10000000-0000-0000-0000-000000000003','Haulit Transport','carrier','CA-AB'),
  ('10000000-0000-0000-0000-000000000004','Rival Corp','contractor','CA-AB');

update public.profiles set organization_id='10000000-0000-0000-0000-000000000001', org_role='admin' where id='00000000-0000-0000-0000-000000000001';
update public.profiles set organization_id='10000000-0000-0000-0000-000000000002' where id='00000000-0000-0000-0000-000000000002';
update public.profiles set organization_id='10000000-0000-0000-0000-000000000003' where id='00000000-0000-0000-0000-000000000003';
update public.profiles set organization_id='10000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-000000000004';
update public.profiles set organization_id='10000000-0000-0000-0000-000000000004', org_role='admin' where id='00000000-0000-0000-0000-000000000005';
update public.profiles set organization_id='10000000-0000-0000-0000-000000000003' where id='00000000-0000-0000-0000-000000000006';

insert into public.projects (id, owner_org_id, name, code, site_point) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Site A','SA',
   extensions.ST_SetSRID(extensions.ST_MakePoint(-113.49, 53.54),4326)::extensions.geography),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','Rival Site','RS', null);

insert into public.project_organizations (project_id, organization_id) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004');

insert into public.project_members (project_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','coordinator'),
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','shipper'),
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','driver'),
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','driver'),
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','handler'),
  ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','coordinator');

insert into public.zones (id, project_id, name, center) values
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Laydown A',
   extensions.ST_SetSRID(extensions.ST_MakePoint(-113.491, 53.541),4326)::extensions.geography);

insert into public.shipping_releases (id, project_id, supplier_org_id, number, issued_by) values
  ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','REL-001','00000000-0000-0000-0000-000000000002');

insert into public.shipments (id, project_id, release_id, carrier_org_id, created_by) values
  ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');

insert into public.shipment_assignments (shipment_id, user_id) values
  ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');

insert into public.handling_units (id, release_id, description, current_project_id, current_shipment_id, created_by) values
  ('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Crate 1 of 3','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');

-- Driver has acknowledged the notice and consented
insert into public.notice_acknowledgments (user_id, notice_version_id)
  select '00000000-0000-0000-0000-000000000003', public.current_notice_version_id('10000000-0000-0000-0000-000000000003');
insert into public.consents (user_id, organization_id, kind, statement_text, owns_device, owns_vehicle)
  values ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','location_tracking','test consent',true,true);

-- Helper to impersonate a user
create or replace function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  reset role; -- drop any prior impersonation so auth.users is readable for the claims lookup
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated', 'email', (select email from auth.users where id = uid))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function tests.as_superuser() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Rival Corp sees nothing on Site A
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000005');
select is((select count(*) from public.projects where id='20000000-0000-0000-0000-000000000001'), 0::bigint, 'rival cannot see Site A project');
select is((select count(*) from public.shipments), 0::bigint, 'rival sees no shipments');
select is((select count(*) from public.handling_units), 0::bigint, 'rival sees no units');
select is((select count(*) from public.shipping_releases), 0::bigint, 'rival sees no releases');
select is((select count(*) from public.zones), 0::bigint, 'rival sees no zones');
select is((select count(*) from public.project_members where project_id='20000000-0000-0000-0000-000000000001'), 0::bigint, 'rival sees no Site A members');
select is((select count(*) from public.profiles where id='00000000-0000-0000-0000-000000000003'), 0::bigint, 'rival cannot see driver profile');
select is((select count(*) from public.organizations where id='10000000-0000-0000-0000-000000000002'), 0::bigint, 'rival cannot see Steelco');
select throws_ok(
  $$insert into public.project_members (project_id, user_id, role) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','coordinator')$$,
  '42501', null, 'rival cannot add themselves to Site A');

-- ---------------------------------------------------------------------------
-- 2. Supplier and carrier both see the project; scoped writes
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000002');
select is((select count(*) from public.projects where id='20000000-0000-0000-0000-000000000001'), 1::bigint, 'shipper sees Site A');
select is((select count(*) from public.projects), 1::bigint, 'shipper sees only Site A');
select is((select count(*) from public.qr_tokens where subject_id='40000000-0000-0000-0000-000000000001'), 1::bigint, 'shipper sees the release token minted by trigger');
select throws_ok(
  $$insert into public.zones (project_id, name, center) values ('20000000-0000-0000-0000-000000000001','Bad zone', extensions.ST_SetSRID(extensions.ST_MakePoint(0,0),4326)::extensions.geography)$$,
  '42501', null, 'shipper cannot create zones');
select lives_ok(
  $$insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source)
    values ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','shipment','50000000-0000-0000-0000-000000000001','released','00000000-0000-0000-0000-000000000002',now(),'dashboard')$$,
  'shipper can record a released event');
select throws_ok(
  $$insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source)
    values ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','shipment','50000000-0000-0000-0000-000000000001','stored','00000000-0000-0000-0000-000000000002',now(),'dashboard')$$,
  '42501', null, 'shipper cannot record a site event');
select throws_ok(
  $$insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source)
    values ('70000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','shipment','50000000-0000-0000-0000-000000000001','released','00000000-0000-0000-0000-000000000001',now(),'dashboard')$$,
  '42501', null, 'cannot record an event as someone else');

-- ---------------------------------------------------------------------------
-- 3. Driver: trip start, pings, own-only visibility
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000003');
select lives_ok($$select public.start_trip('50000000-0000-0000-0000-000000000001','auto','70000000-0000-0000-0000-000000000010')$$, 'assigned driver starts an auto trip');
select is((select current_status from public.shipments where id='50000000-0000-0000-0000-000000000001'), 'in_transit'::public.custody_status, 'status derived to in_transit');
select is(
  (select public.ingest_pings(t.id, t.device_token, ('[{"lat":53.5,"lng":-113.5,"precision_m":80,"recorded_at":"' || now()::text || '"}]')::jsonb) from public.trips t where t.driver_id='00000000-0000-0000-0000-000000000003'),
  1, 'driver ingests a ping with the right device token');
select throws_ok(
  $$select public.ingest_pings((select id from public.trips limit 1), 'wrong-token', '[]'::jsonb)$$,
  'P0005', null, 'wrong device token rejected');
select is((select count(*) from public.location_pings), 1::bigint, 'driver can read own pings');

-- second driver on the same project cannot see the first driver's pings or start a trip unassigned
select tests.as_user('00000000-0000-0000-0000-000000000006');
select is((select count(*) from public.location_pings), 0::bigint, 'other driver cannot read pings directly');
select throws_ok($$select public.start_trip('50000000-0000-0000-0000-000000000001','manual','70000000-0000-0000-0000-000000000011')$$,
  null, null, 'unassigned driver cannot start a trip');
select throws_ok($$select public.get_trip_pings((select id from public.trips limit 1), 'shipment_status')$$,
  null, null, 'driver role cannot use the coordinator ping RPC');

-- ---------------------------------------------------------------------------
-- 4. Coordinator reads pings only through the logged RPC
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000001');
select is((select count(*) from public.location_pings), 0::bigint, 'coordinator cannot read pings directly');
select is((select count(*) from public.get_trip_pings((select id from public.trips limit 1), 'shipment_status')), 1::bigint, 'coordinator reads pings via RPC');
select is((select count(*) from public.access_log where subject='trip_pings'), 1::bigint, 'the read was logged');

-- ---------------------------------------------------------------------------
-- 5. Append-only and void/derive
-- ---------------------------------------------------------------------------
select throws_ok($$update public.custody_events set notes='x' where id='70000000-0000-0000-0000-000000000001'$$, null, null, 'events cannot be updated');
select throws_ok($$delete from public.custody_events where id='70000000-0000-0000-0000-000000000001'$$, null, null, 'events cannot be deleted');
select lives_ok(
  $$insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, supersedes_id)
    values ('70000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000001','shipment','50000000-0000-0000-0000-000000000001','void','00000000-0000-0000-0000-000000000001',now(),'dashboard','70000000-0000-0000-0000-000000000010')$$,
  'coordinator voids the tracking_started event');
select is((select current_status from public.shipments where id='50000000-0000-0000-0000-000000000001'), 'released'::public.custody_status, 'status re-derived after void');

select * from finish();
rollback;
