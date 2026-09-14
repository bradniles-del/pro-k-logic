import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/AuthGate";
import { acceptInvitation, createOrganization, createProject, listMemberships, type Enums } from "../lib/api";
import { supabase } from "../lib/supabase";

const JURISDICTIONS = ["CA-AB", "CA-BC", "CA-ON", "CA-QC", "CA-*", "US-CA", "US-TX", "US-*"];
const ORG_KINDS: Enums["org_kind"][] = ["contractor", "owner", "supplier", "carrier"];
const TIMEZONES = [
  "America/Edmonton",
  "America/Vancouver",
  "America/Regina",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

/**
 * First-run flow. Step 1: no organization -> create one (or accept an
 * invitation). Step 2: organization but no projects -> create a project.
 * Also reused as the "New project" screen via /projects/new.
 */
export default function Onboarding({ forceProject = false }: { forceProject?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const invite = params.get("invite");
  const navigate = useNavigate();
  const [hasProjects, setHasProjects] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!profile?.organization_id) {
      setHasProjects(false);
      return;
    }
    listMemberships()
      .then((m) => setHasProjects(m.length > 0))
      .catch(() => setHasProjects(false));
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!forceProject && profile?.organization_id && hasProjects && !invite) navigate("/projects", { replace: true });
  }, [forceProject, profile?.organization_id, hasProjects, invite, navigate]);

  if (invite) return <InviteStep token={invite} onDone={refreshProfile} />;

  if (!profile?.organization_id) return <OrgStep onDone={refreshProfile} />;
  if (hasProjects === undefined) return <main className="page muted">Loading...</main>;
  return <ProjectStep />;
}

function InviteStep({ token, onDone }: { token: string; onDone: () => Promise<unknown> }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const p = await acceptInvitation(token);
      await onDone();
      navigate(`/p/${p.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>You have been invited</h1>
      <p>Accepting adds you to the project and, if you are new, to the inviting organization.</p>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={accept}>
          {busy ? "Accepting..." : "Accept invitation"}
        </button>
        <button className="btn" onClick={() => navigate("/onboarding", { replace: true })}>
          Skip
        </button>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}

function OrgStep({ onDone }: { onDone: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Enums["org_kind"]>("contractor");
  const [jurisdiction, setJurisdiction] = useState("CA-AB");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createOrganization({ name: name.trim(), kind, jurisdiction });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>Set up your organization</h1>
      <p className="muted">
        Your organization is the tenant. Its jurisdiction decides which privacy notice your own workers see.
      </p>
      <form onSubmit={submit} className="form">
        <label>
          Organization name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as Enums["org_kind"])}>
            {ORG_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jurisdiction
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating..." : "Create organization"}
          </button>
          <button className="btn" type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </form>
    </main>
  );
}

function ProjectStep() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("America/Edmonton");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const latN = lat.trim() ? Number(lat) : null;
    const lngN = lng.trim() ? Number(lng) : null;
    if ((latN === null) !== (lngN === null)) {
      setError("Enter both latitude and longitude, or leave both blank.");
      setBusy(false);
      return;
    }
    if ((latN !== null && Number.isNaN(latN)) || (lngN !== null && Number.isNaN(lngN))) {
      setError("Latitude and longitude must be numbers.");
      setBusy(false);
      return;
    }
    try {
      const p = await createProject({
        name: name.trim(),
        code: code.trim() || null,
        timezone,
        lat: latN,
        lng: lngN,
      });
      navigate(`/p/${p.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>Create a project</h1>
      <p className="muted">A project is the sharing boundary: you, your suppliers and carriers all see it.</p>
      <form onSubmit={submit} className="form">
        <label>
          Project name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SITE-A" />
        </label>
        <label>
          Timezone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label>
            Site latitude (optional)
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="53.5461" />
          </label>
          <label>
            Site longitude (optional)
            <input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-113.4938" />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating..." : "Create project"}
          </button>
          <button className="btn" type="button" onClick={() => navigate("/projects")}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
