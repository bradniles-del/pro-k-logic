import { useEffect, useState } from "react";
import type { ProjectRole } from "@prok/shared";
import { supabase } from "../lib/supabase";

type Membership = {
  role: ProjectRole;
  projects: { id: string; name: string; code: string | null } | null;
};

/** Every project the signed-in user belongs to, with their role. */
export default function Projects() {
  const [rows, setRows] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("project_members")
      .select("role, projects(id,name,code)")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <main>
      <nav>
        <h1 style={{ margin: 0 }}>Projects</h1>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="muted">You are not on any project yet. Ask a coordinator to invite you.</p>
      )}
      <ul className="projects">
        {rows.map((m) => (
          <li key={m.projects?.id ?? m.role}>
            <strong>{m.projects?.name ?? "(unknown project)"}</strong>
            <div className="muted">
              {m.projects?.code} · {m.role}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
