-- 0008: onboarding RPCs and platform default notices

-- Create an organization and make the caller its admin (first-run onboarding).
create or replace function public.create_organization(p_name text, p_kind public.org_kind, p_jurisdiction text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare o public.organizations;
begin
  if (select organization_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'user already belongs to an organization';
  end if;
  insert into public.organizations (name, kind, jurisdiction, claimed_at)
    values (p_name, p_kind, coalesce(p_jurisdiction, 'CA-AB'), now())
    returning * into o;
  update public.profiles set organization_id = o.id, org_role = 'admin' where id = auth.uid();
  return o;
end $$;

-- Create a project owned by the caller's org; caller becomes its coordinator.
create or replace function public.create_project(p_name text, p_code text, p_timezone text, p_lat float8, p_lng float8)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare p public.projects; org uuid := public.auth_org_id();
begin
  if org is null then raise exception 'join or create an organization first'; end if;
  insert into public.projects (owner_org_id, name, code, timezone, site_point)
    values (org, p_name, p_code, coalesce(p_timezone, 'America/Edmonton'),
            case when p_lat is not null and p_lng is not null
                 then extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography end)
    returning * into p;
  insert into public.project_organizations (project_id, organization_id, invited_by) values (p.id, org, auth.uid());
  insert into public.project_members (project_id, user_id, role) values (p.id, auth.uid(), 'coordinator');
  return p;
end $$;

-- Accept an invitation: binds the user to the org (claiming a placeholder if
-- needed) and adds them to the project with the invited role.
create or replace function public.accept_invitation(p_token text)
returns public.projects
language plpgsql security definer set search_path = public as $$
declare inv public.invitations; p public.projects; my_org uuid := public.auth_org_id();
begin
  select * into inv from public.invitations where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'invitation not found or expired'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'invitation was issued to a different email';
  end if;
  if my_org is null then
    update public.profiles set organization_id = inv.organization_id where id = auth.uid();
    update public.organizations set is_placeholder = false, claimed_at = coalesce(claimed_at, now())
      where id = inv.organization_id and is_placeholder;
    -- first claimant of a placeholder becomes its admin
    if not exists (select 1 from public.profiles where organization_id = inv.organization_id and org_role = 'admin' and id <> auth.uid()) then
      update public.profiles set org_role = 'admin' where id = auth.uid();
    end if;
  elsif my_org <> inv.organization_id then
    raise exception 'you belong to a different organization than this invitation';
  end if;
  insert into public.project_organizations (project_id, organization_id, invited_by)
    values (inv.project_id, inv.organization_id, inv.invited_by) on conflict do nothing;
  insert into public.project_members (project_id, user_id, role)
    values (inv.project_id, auth.uid(), inv.role)
    on conflict (project_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_by = auth.uid(), accepted_at = now() where id = inv.id;
  select * into p from public.projects where id = inv.project_id;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Platform default notices. DRAFT wording — to be reviewed by counsel before
-- launch (see Privacy & Legal Brief, requirement 3). Purposes deliberately
-- exclude lone-worker safety pending that decision.
-- ---------------------------------------------------------------------------
insert into public.notice_versions (organization_id, jurisdiction, version, title, body_md) values
(null, 'CA-*', 1, 'How Pro-K-Logic uses your location',
$md$
**What is collected.** While a shipment you accepted is in transit, this app records your phone's location (coordinates, time, and accuracy). In manual mode it records a location only when you tap "Ping location". When you scan material on site, it records the location of that scan.

**When it is on.** Only between "Start tracking" and "Delivered" (or a 14-hour limit), and only for shipments assigned to you. The tracking indicator is visible on your phone the whole time. Nothing is collected off shift.

**Why.** To show the receiving site when your shipment will arrive, to notify them as you approach, and to record proof of delivery. It is not used to evaluate your driving or performance.

**Who sees it.** Coordinators and receivers on the project you are delivering to. Every time someone views your trip, it is logged and you can see the log in the app.

**How long.** Location points are deleted after {{retention_days}} days. Delivery records are kept per the project's document retention.

**Where.** Data is stored in Canada (AWS Canada Central). Our service provider, Supabase Inc., is a US company; its staff may access systems for support. Questions: {{contact_name}}, {{contact_email}}.

Your employer, {{employer_name}}, is the organization collecting this information under the *Personal Information Protection Act* / PIPEDA.
$md$),
(null, 'CA-QC', 1, 'Comment Pro-K-Logic utilise votre position / How Pro-K-Logic uses your location',
$md$
**Avis (Loi 25, art. 8.1).** Cette application comprend une fonction de localisation. Elle est désactivée par défaut et ne s'active que lorsque vous appuyez sur « Démarrer le suivi » pour une expédition qui vous est assignée.

**What is collected.** While a shipment you accepted is in transit, this app records your phone's location. In manual mode it records a location only when you tap "Ping location". Scans on site record the location of the scan.

**Why.** To show the receiving site when your shipment will arrive, to notify them as you approach, and to record proof of delivery. Not used to evaluate performance.

**Who sees it, how long, where.** Coordinators and receivers on the project; every view is logged. Location points are deleted after {{retention_days}} days. Data is stored in Canada (AWS Canada Central); Supabase Inc. (US) is a service provider. Questions: {{contact_name}}, {{contact_email}}.
$md$),
(null, 'US-*', 1, 'Notice of electronic monitoring and location collection',
$md$
**Notice at collection.** {{employer_name}} collects the following categories of personal information through this app: precise geolocation (a sensitive category), device identifiers, and the records you create (scans, photos, signatures).

**When.** Only between "Start tracking" and "Delivered" (or a 14-hour limit) for shipments assigned to you, and at the moment of each scan. Nothing is collected off shift. The tracking indicator is visible on your phone.

**Purpose.** Shipment status and ETA, arrival notification to the receiving site, and proof of delivery. Not sold, not shared for advertising, not used to infer anything about where you stop.

**Retention.** Location points are deleted after {{retention_days}} days; delivery records per the project's document retention.

**Your rights.** You may decline location permission and use manual status entry instead. California residents have the rights described at {{privacy_policy_url}}. Questions: {{contact_name}}, {{contact_email}}.

This notice also serves as written notice of electronic monitoring where state law requires it (e.g. NY Civ. Rights Law §52-c, Conn. Gen. Stat. §31-48d, 19 Del. C. §705).
$md$);
