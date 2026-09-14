import { Link, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthGate";

/** Simple top bar: brand, optional project tabs, sign-out. */
export default function TopNav({ project }: { project?: { id: string; name: string; code: string | null } }) {
  const { user, profile } = useAuth();
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link to="/projects" className="brand">
          Pro-K-Logic
        </Link>
        {project && (
          <nav className="tabs" aria-label="Project">
            <span className="tabs-project" title={project.code ?? undefined}>
              {project.name}
            </span>
            <NavLink to={`/p/${project.id}/srns`}>SRNs</NavLink>
            <NavLink to={`/p/${project.id}/material`}>Material</NavLink>
            <NavLink to={`/p/${project.id}/updates`}>Updates</NavLink>
          </nav>
        )}
        <div className="topnav-right">
          <span className="muted small" title={user.email ?? ""}>
            {profile?.full_name || user.email}
          </span>
          <button className="btn small" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
