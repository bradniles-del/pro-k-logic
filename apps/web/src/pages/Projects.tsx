import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "../components/TopNav";
import { listMemberships, type Membership } from "../lib/api";

/** Every project the signed-in user belongs to, with their role. */
export default function Projects() {
  const [rows, setRows] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMemberships()
      .then((m) => setRows(m.filter((r) => r.projects).sort((a, b) => a.projects!.name.localeCompare(b.projects!.name))))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <TopNav />
      <main className="page">
        <div className="page-head">
          <h1>Projects</h1>
          <Link className="btn primary" to="/projects/new">
            New project
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading...</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="muted">
            You are not on any project yet. Create one, or ask a coordinator to invite you.
          </p>
        )}
        <ul className="list">
          {rows.map((m) => (
            <li key={m.projects!.id}>
              <Link to={`/p/${m.projects!.id}`} className="list-link">
                <div>
                  <strong>{m.projects!.name}</strong>
                  <div className="muted small">{m.projects!.code ?? "no code"} · {m.projects!.timezone}</div>
                </div>
                <span className="chip chip-blue">{m.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
