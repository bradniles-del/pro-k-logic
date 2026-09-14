import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getProfile, type Profile } from "../lib/api";

export type AuthState = {
  session: Session;
  user: User;
  profile: Profile | null;
  /** Re-reads the profile row (after onboarding changes organization_id). */
  refreshProfile: () => Promise<Profile | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthGate>");
  return ctx;
}

/**
 * Wraps every signed-in route. Loads the profile once, exposes it through
 * context, and sends users with no organization to /onboarding.
 */
export default function AuthGate({ session, children }: { session: Session; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  const refreshProfile = useCallback(async () => {
    try {
      const p = await getProfile(session.user.id);
      setProfile(p);
      return p;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [session.user.id]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  if (error) {
    return (
      <main className="page narrow">
        <p className="error">Could not load your profile: {error}</p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </main>
    );
  }
  if (profile === undefined) return <main className="page muted">Loading your account...</main>;

  const onboarding = location.pathname.startsWith("/onboarding");
  if (!profile?.organization_id && !onboarding) {
    const search = location.search || "";
    return <Navigate to={`/onboarding${search}`} replace />;
  }

  return (
    <AuthContext.Provider value={{ session, user: session.user, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
