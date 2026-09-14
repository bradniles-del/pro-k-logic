-- Pro-K-Logic Phase 1 tests (pgTAP): shipment updates, location names,
-- search, extraction jobs.
-- Run locally:  supabase test db
-- Run remotely: python3 supabase/tests/run_remote.py supabase/tests/002_phase1.sql
--
-- Same fixtures as 001_isolation.sql: Acme Contractors owns project "Site A".
-- Steelco (supplier) and Haulit (carrier) are invited. Rival Corp is not.

begin;
create schema if not exists tests;
-- tests.as_user() is called while already impersonating an authenticated user
grant usage on schema tests to authenticated;
select plan(13);

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
-- 1. Shipment updates: coordinator posts, rate limit, length, append-only
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000001');
-- (e) length check runs before the rate-limit window is opened by (a)
select throws_ok(
  $$insert into public.shipment_updates (project_id, shipment_id, author_id, kind, text)
    values ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','note', repeat('x', 141))$$,
  '23514', null, 'update text longer than 140 chars is rejected');
-- (a)
select lives_ok(
  $$insert into public.shipment_updates (id, project_id, shipment_id, author_id, kind, text)
    values ('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','delay','truck stopped for flat tire')$$,
  'coordinator can post a delay update');
-- (b)
select throws_ok(
  $$insert into public.shipment_updates (project_id, shipment_id, author_id, kind, text)
    values ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','note','again')$$,
  'P0010', null, 'second update by same author on same shipment within 60s is rate limited');
-- (d)
select throws_ok($$update public.shipment_updates set text='edited' where id='80000000-0000-0000-0000-000000000001'$$, null, null, 'updates cannot be updated');
select throws_ok($$delete from public.shipment_updates where id='80000000-0000-0000-0000-000000000001'$$, null, null, 'updates cannot be deleted');

-- ---------------------------------------------------------------------------
-- 2. Handler stores a unit at a named spot; location names and search
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000004');
-- (f)
select lives_ok(
  $$insert into public.custody_events (id, project_id, subject_type, subject_id, type, actor_id, occurred_at, source, location_name)
    values ('70000000-0000-0000-0000-000000000030','20000000-0000-0000-0000-000000000001','handling_unit','60000000-0000-0000-0000-000000000001','stored','00000000-0000-0000-0000-000000000004',now(),'dashboard','Laydown A north corner')$$,
  'handler records a stored event with a location name');
select is((select current_location_name from public.handling_units where id='60000000-0000-0000-0000-000000000001'), 'Laydown A north corner', 'unit current_location_name synced from the event');
-- (g)
select results_eq(
  $$select location_name, unit_count from public.project_location_names('20000000-0000-0000-0000-000000000001')$$,
  $$values ('Laydown A north corner'::text, 1::bigint)$$,
  'project_location_names returns the one name with count 1');
-- (h)
select is((select unit_id from public.find_material('20000000-0000-0000-0000-000000000001', 'Crate')), '60000000-0000-0000-0000-000000000001'::uuid, 'find_material finds the crate');

-- ---------------------------------------------------------------------------
-- 3. Extraction jobs: shipper requests one for their document; rival blind
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-0000-0000-000000000002');
-- (i)
select lives_ok(
  $$insert into public.documents (id, project_id, release_id, kind, storage_path, filename, mime_type, uploaded_by)
    values ('90000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','other','20000000-0000-0000-0000-000000000001/x.pdf','x.pdf','application/pdf','00000000-0000-0000-0000-000000000002')$$,
  'shipper uploads a document row');
select lives_ok(
  $$insert into public.extraction_jobs (project_id, document_id, release_id, requested_by)
    values ('20000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')$$,
  'shipper can request an extraction job');

select tests.as_user('00000000-0000-0000-0000-000000000005');
-- (c)
select is((select count(*) from public.shipment_updates), 0::bigint, 'rival sees no shipment updates');
-- (j)
select is((select count(*) from public.extraction_jobs), 0::bigint, 'rival sees no extraction jobs');

select * from finish();
rollback;
