import { createContext, useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import TopNav from "../components/TopNav";
import { getProject, myRoleOn, type Enums, type Project } from "../lib/api";

type ProjectCtx = { project: Project; role: Enums["project_role"] | null };
const Ctx = createContext<ProjectCtx | null>(null);

export function useProject(): ProjectCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useProject must be used inside a project route");
  return c;
}

/** Loads the project once and renders the tab bar; child routes use useProject(). */
export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [state, setState] = useState<ProjectCtx | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setState(null);
    setError(null);
    Promise.all([getProject(projectId), myRoleOn(projectId)])
      .then(([project, role]) => setState({ project, role }))
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  if (error) {
    return (
      <>
        <TopNav />
        <main className="page">
          <p className="error">Could not open this project: {error}</p>
        </main>
      </>
    );
  }
  if (!state) {
    return (
      <>
        <TopNav />
        <main className="page muted">Loading project...</main>
      </>
    );
  }
  return (
    <Ctx.Provider value={state}>
      <TopNav project={state.project} />
      <Outlet />
    </Ctx.Provider>
  );
}
