import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import SignIn from "./pages/SignIn";
import Projects from "./pages/Projects";
import ScanLanding from "./pages/ScanLanding";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="muted">Loading...</main>;

  return (
    <Routes>
      {/* Consignee scan landing page: public, works signed in or out. */}
      <Route path="/s/:token" element={<ScanLanding />} />
      <Route path="/sign-in" element={session ? <Navigate to="/" replace /> : <SignIn />} />
      <Route path="/" element={session ? <Projects /> : <Navigate to="/sign-in" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
