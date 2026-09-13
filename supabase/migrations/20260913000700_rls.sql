-- 0007: row-level security
--
-- Principles:
--   * project membership is the read boundary; role gates writes
--   * custody_events and location_pings and access_log are append-only
--   * location_pings are readable directly only by the trip's own driver;
--     everyone else goes through the logged RPCs
--   * nobody can grant themselves membership

-- Enable RLS everywhere
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Append-only tables: revoke the verbs outright for API roles.
revoke update, delete on public.custody_events from anon, authenticated;
revoke update, delete on public.location_pings from anon, authenticated;
revoke update, delete on public.access_log from anon, authenticated;
revoke update, delete on public.notice_acknowledgments from anon, authenticated;
-- Reference tables: read-only for API roles
revoke insert, update, delete on public.role_event_permissions from anon, authenticated;
revoke insert, update, delete on public.status_precedence from anon, authenticated;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy org_select on public.organizations for select to authenticated
  using (
    id = public.auth_org_id()
    or exists (
      select 1 from public.project_organizations po
      join public.project_members pm on pm.project_id = po.project_id
      where po.organization_id = organizations.id and pm.user_id = auth.uid()
    )
  );
create policy org_insert on public.organizations for insert to authenticated
  with check (true);   -- anyone may create an org (their own, or a placeholder); ownership is via profiles/claims
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or organization_id = public.auth_org_id()
    or exists (
      select 1 from public.project_members a
      join public.project_members b on a.project_id = b.project_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and org_role = (select org_role from public.profiles p where p.id = auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- projects and membership
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (public.is_project_member(id) or public.is_org_admin(owner_org_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_org_id = public.auth_org_id());
create policy projects_update on public.projects for update to authenticated
  using (public.has_project_role(id, array['coordinator']::public.project_role[]) or public.is_org_admin(owner_org_id));

create policy project_orgs_select on public.project_organizations for select to authenticated
  using (public.is_project_member(project_id));
create policy project_orgs_write on public.project_organizations for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[]));

create policy project_members_select on public.project_members for select to authenticated
  using (public.is_project_member(project_id));
-- Only coordinators (or the owner org's admins) manage membership; nobody can add themselves
-- except the creator of a brand-new project (handled by create_project RPC later).
create policy project_members_write on public.project_members for all to authenticated
  using (
    public.has_project_role(project_id, array['coordinator']::public.project_role[])
    or public.is_org_admin((select owner_org_id from public.projects p where p.id = project_members.project_id))
  )
  with check (
    public.has_project_role(project_id, array['coordinator']::public.project_role[])
    or public.is_org_admin((select owner_org_id from public.projects p where p.id = project_members.project_id))
  );

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[])
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy invitations_write on public.invitations for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[]));

create policy zones_select on public.zones for select to authenticated
  using (public.is_project_member(project_id));
create policy zones_write on public.zones for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[]));

create policy roster_select on public.notification_roster for select to authenticated
  using (user_id = auth.uid() or public.has_project_role(project_id, array['coordinator']::public.project_role[]));
create policy roster_write on public.notification_roster for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[])
         or (user_id = auth.uid() and public.is_project_member(project_id)))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[])
         or (user_id = auth.uid() and public.is_project_member(project_id)));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- procurement and releases
-- ---------------------------------------------------------------------------
create policy po_select on public.purchase_orders for select to authenticated
  using (public.is_project_member(project_id));
create policy po_write on public.purchase_orders for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[]));

create policy po_lines_select on public.po_lines for select to authenticated
  using (public.is_project_member((select project_id from public.purchase_orders po where po.id = po_lines.po_id)));
create policy po_lines_write on public.po_lines for all to authenticated
  using (public.has_project_role((select project_id from public.purchase_orders po where po.id = po_lines.po_id), array['coordinator']::public.project_role[]))
  with check (public.has_project_role((select project_id from public.purchase_orders po where po.id = po_lines.po_id), array['coordinator']::public.project_role[]));

create policy releases_select on public.shipping_releases for select to authenticated
  using (public.is_project_member(project_id));
create policy releases_write on public.shipping_releases for all to authenticated
  using (public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[]));

create policy release_lines_select on public.release_lines for select to authenticated
  using (public.is_project_member((select project_id from public.shipping_releases r where r.id = release_lines.release_id)));
create policy release_lines_write on public.release_lines for all to authenticated
  using (public.has_project_role((select project_id from public.shipping_releases r where r.id = release_lines.release_id), array['coordinator','shipper']::public.project_role[]))
  with check (public.has_project_role((select project_id from public.shipping_releases r where r.id = release_lines.release_id), array['coordinator','shipper']::public.project_role[]));

create policy documents_select on public.documents for select to authenticated
  using (public.is_project_member(project_id));
create policy documents_write on public.documents for all to authenticated
  using (public.has_project_role(project_id, array['coordinator','shipper','handler']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator','shipper','handler']::public.project_role[]));

-- ---------------------------------------------------------------------------
-- shipments and units
-- ---------------------------------------------------------------------------
create policy shipments_select on public.shipments for select to authenticated
  using (public.is_project_member(project_id));
create policy shipments_write on public.shipments for all to authenticated
  using (public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator','shipper']::public.project_role[]));

create policy assignments_select on public.shipment_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_project_member(public.shipment_project(shipment_id)));
create policy assignments_write on public.shipment_assignments for all to authenticated
  using (public.has_project_role(public.shipment_project(shipment_id), array['coordinator','shipper']::public.project_role[]))
  with check (public.has_project_role(public.shipment_project(shipment_id), array['coordinator','shipper']::public.project_role[]));

create policy units_select on public.handling_units for select to authenticated
  using (public.unit_visible(id));
create policy units_insert on public.handling_units for insert to authenticated
  with check (public.has_project_role(current_project_id, array['coordinator','shipper','handler']::public.project_role[]));
create policy units_update on public.handling_units for update to authenticated
  using (public.has_project_role(current_project_id, array['coordinator','shipper','handler']::public.project_role[]))
  with check (public.has_project_role(current_project_id, array['coordinator','shipper','handler']::public.project_role[]));

create policy unit_projects_select on public.unit_projects for select to authenticated
  using (public.is_project_member(project_id));
-- unit_projects rows are written only by triggers (security definer)

create policy unit_contents_select on public.unit_contents for select to authenticated
  using (public.unit_visible(unit_id));
create policy unit_contents_write on public.unit_contents for all to authenticated
  using (public.has_project_role((select current_project_id from public.handling_units u where u.id = unit_contents.unit_id), array['coordinator','shipper','handler']::public.project_role[]))
  with check (public.has_project_role((select current_project_id from public.handling_units u where u.id = unit_contents.unit_id), array['coordinator','shipper','handler']::public.project_role[]));

-- Tokens: members may read tokens of things they can see; minted by triggers, voided by coordinators/shippers.
create policy tokens_select on public.qr_tokens for select to authenticated
  using (
    (subject_type = 'handling_unit' and public.unit_visible(subject_id))
    or (subject_type = 'release' and public.is_project_member((select project_id from public.shipping_releases r where r.id = qr_tokens.subject_id)))
  );
create policy tokens_insert on public.qr_tokens for insert to authenticated
  with check (
    (subject_type = 'handling_unit' and public.has_project_role((select current_project_id from public.handling_units u where u.id = qr_tokens.subject_id), array['coordinator','shipper','handler']::public.project_role[]))
    or (subject_type = 'release' and public.has_project_role((select project_id from public.shipping_releases r where r.id = qr_tokens.subject_id), array['coordinator','shipper']::public.project_role[]))
  );
create policy tokens_update on public.qr_tokens for update to authenticated
  using (
    (subject_type = 'handling_unit' and public.has_project_role((select current_project_id from public.handling_units u where u.id = qr_tokens.subject_id), array['coordinator','shipper','handler']::public.project_role[]))
    or (subject_type = 'release' and public.has_project_role((select project_id from public.shipping_releases r where r.id = qr_tokens.subject_id), array['coordinator','shipper']::public.project_role[]))
  );

-- ---------------------------------------------------------------------------
-- trips, events, evidence, pings
-- ---------------------------------------------------------------------------
create policy trips_select on public.trips for select to authenticated
  using (driver_id = auth.uid() or public.has_project_role(project_id, array['coordinator','viewer','handler','shipper']::public.project_role[]));
-- trips are created/ended only via start_trip / end_trip (security definer)

create policy events_select on public.custody_events for select to authenticated
  using (
    public.is_project_member(project_id)
    or (subject_type = 'handling_unit' and public.unit_visible(subject_id))
  );
create policy events_insert on public.custody_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.role_may_record(project_id, type)
    and (
      (subject_type = 'shipment' and public.shipment_project(subject_id) = project_id)
      or (subject_type = 'handling_unit'
          and (select current_project_id from public.handling_units u where u.id = custody_events.subject_id) = project_id)
    )
    and (trip_id is null or exists (select 1 from public.trips t where t.id = custody_events.trip_id and (t.driver_id = auth.uid() or public.has_project_role(t.project_id, array['coordinator']::public.project_role[]))))
  );

create policy evidence_select on public.evidence for select to authenticated
  using (public.is_project_member(project_id));
create policy evidence_insert on public.evidence for insert to authenticated
  with check (captured_by = auth.uid() and public.is_project_member(project_id));

create policy event_evidence_select on public.event_evidence for select to authenticated
  using (public.is_project_member((select project_id from public.custody_events e where e.id = event_evidence.event_id)));
create policy event_evidence_insert on public.event_evidence for insert to authenticated
  with check (exists (select 1 from public.evidence ev where ev.id = event_evidence.evidence_id and ev.captured_by = auth.uid()));

create policy forms_select on public.form_definitions for select to authenticated
  using (public.is_project_member(project_id));
create policy forms_write on public.form_definitions for all to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]))
  with check (public.has_project_role(project_id, array['coordinator']::public.project_role[]));

-- Pings: the driver may read their own; nobody else reads directly.
create policy pings_select_own on public.location_pings for select to authenticated
  using (exists (select 1 from public.trips t where t.id = location_pings.trip_id and t.driver_id = auth.uid()));
-- inserts only via ingest_pings (security definer)

-- ---------------------------------------------------------------------------
-- privacy tables
-- ---------------------------------------------------------------------------
create policy notices_select on public.notice_versions for select to authenticated using (true);
create policy notices_write on public.notice_versions for all to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id))
  with check (organization_id is not null and public.is_org_admin(organization_id));

create policy acks_select on public.notice_acknowledgments for select to authenticated
  using (user_id = auth.uid()
         or public.is_org_admin((select organization_id from public.profiles p where p.id = notice_acknowledgments.user_id)));
create policy acks_insert on public.notice_acknowledgments for insert to authenticated
  with check (user_id = auth.uid());

create policy consents_select on public.consents for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (user_id = auth.uid() and organization_id = public.auth_org_id());
create policy consents_revoke on public.consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- access_log: written by RPCs; readable by org admins for their org's projects, and by workers via my_access_log()
create policy access_log_select on public.access_log for select to authenticated
  using (public.has_project_role(project_id, array['coordinator']::public.project_role[]) and viewer_id = auth.uid()
         or public.is_org_admin((select owner_org_id from public.projects p where p.id = access_log.project_id)));

create policy incidents_select on public.incidents for select to authenticated
  using (public.is_org_admin(organization_id));
create policy incidents_write on public.incidents for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- reference tables
create policy rep_select on public.role_event_permissions for select to authenticated using (true);
create policy sp_select on public.status_precedence for select to authenticated using (true);
