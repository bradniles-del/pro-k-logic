import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthGate from "./components/AuthGate";
import SignIn from "./pages/SignIn";
import Projects from "./pages/Projects";
import Onboarding from "./pages/Onboarding";
import ProjectLayout from "./pages/ProjectLayout";
import ProjectHome from "./pages/ProjectHome";
import SrnList from "./pages/SrnList";
import SrnNew from "./pages/SrnNew";
import SrnDetail from "./pages/SrnDetail";
import MaterialSearch from "./pages/MaterialSearch";
import Updates from "./pages/Updates";
import ScanLanding from "./pages/ScanLanding";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="page muted">Loading...</main>;

  /** Everything behind the auth gate. */
  const gated = (el: ReactNode) =>
    session ? <AuthGate session={session}>{el}</AuthGate> : <RedirectToSignIn />;

  return (
    <Routes>
      {/* Consignee scan landing page: public, works signed in or out. */}
      <Route path="/s/:token" element={<ScanLanding />} />
      <Route path="/sign-in" element={session ? <AfterSignIn /> : <SignIn />} />

      <Route path="/onboarding" element={gated(<Onboarding />)} />
      <Route path="/projects" element={gated(<Projects />)} />
      <Route path="/projects/new" element={gated(<Onboarding forceProject />)} />

      <Route path="/p/:projectId" element={gated(<ProjectLayout />)}>
        <Route index element={<ProjectHome />} />
        <Route path="srns" element={<SrnList />} />
        <Route path="srns/new" element={<SrnNew />} />
        <Route path="srns/:releaseId" element={<SrnDetail />} />
        <Route path="material" element={<MaterialSearch />} />
        <Route path="updates" element={<Updates />} />
      </Route>

      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

/** Remember where the user was heading so sign-in can return them there. */
function RedirectToSignIn() {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/sign-in?next=${next}`} replace />;
}

function AfterSignIn() {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
  return <Navigate to={safe} replace />;
}
