import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReleases, listUpdates, type ReleaseListRow, type UpdateRow } from "../lib/api";
import { KindChip, fmtDate } from "../components/ui";
import { useProject } from "./ProjectLayout";

/** Project landing: name/code, quick counts, the newest SRNs and updates. */
export default function ProjectHome() {
  const { project, role } = useProject();
  const [releases, setReleases] = useState<ReleaseListRow[] | null>(null);
  const [updates, setUpdates] = useState<UpdateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReleases(project.id).then(setReleases).catch((e: Error) => setError(e.message));
    listUpdates(project.id, 5).then(setUpdates).catch((e: Error) => setError(e.message));
  }, [project.id]);

  const unitCount = releases?.reduce((n, r) => n + r.handling_units.length, 0) ?? 0;
  const base = `/p/${project.id}`;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <div className="muted">
            {project.code ?? "no code"} · {project.timezone}
            {role && (
              <>
                {" "}
                · <span className="chip chip-blue">{role}</span>
              </>
            )}
          </div>
        </div>
        <Link className="btn primary" to={`${base}/srns/new`}>
          New SRN
        </Link>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="cards">
        <Link to={`${base}/srns`} className="card">
          <div className="card-num">{releases ? releases.length : "–"}</div>
          <div>SRNs</div>
        </Link>
        <Link to={`${base}/material`} className="card">
          <div className="card-num">{releases ? unitCount : "–"}</div>
          <div>Handling units</div>
        </Link>
        <Link to={`${base}/updates`} className="card">
          <div className="card-num">{updates ? updates.length : "–"}</div>
          <div>Recent updates</div>
        </Link>
      </div>

      <section className="section">
        <h2>Latest SRNs</h2>
        {releases && releases.length === 0 && <p className="muted">No SRNs yet.</p>}
        <ul className="list">
          {(releases ?? []).slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link to={`${base}/srns/${r.id}`} className="list-link">
                <div>
                  <strong>{r.number}</strong>
                  <div className="muted small">
                    {r.organizations?.name ?? "unknown supplier"} · {fmtDate(r.issued_at)}
                  </div>
                </div>
                <span className="muted small">
                  {r.release_lines.length} lines · {r.handling_units.length} units
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Latest updates</h2>
        {updates && updates.length === 0 && <p className="muted">No updates yet.</p>}
        <ul className="list">
          {(updates ?? []).map((u) => (
            <li key={u.id} className="update-row">
              <KindChip kind={u.kind} />
              <span>{u.text}</span>
              <span className="muted small">
                {u.shipments?.shipping_releases?.number ?? "shipment"} · {u.profiles?.full_name || "someone"} ·{" "}
                {fmtDate(u.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
