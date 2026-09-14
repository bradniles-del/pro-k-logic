import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Tiny external store for the signed-in session and the user's profile.
 * The root layout reads it to gate navigation (signed out -> /sign-in,
 * no organization -> /onboarding, otherwise -> (app)). Screens call
 * refreshProfile() after onboarding so the gate sees the new organization.
 */

export type AuthState = {
  /** undefined while the initial session lookup is in flight */
  session: Session | null | undefined;
  /** undefined until loaded for the current session; null if the row is missing */
  profile: { id: string; organization_id: string | null; full_name: string } | null | undefined;
  /** invite token captured from a deep link before the user was signed in */
  pendingInvite: string | null;
};

let state: AuthState = { session: undefined, profile: undefined, pendingInvite: null };
const listeners = new Set<() => void>();
let started = false;

function emit(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export async function refreshProfile(): Promise<void> {
  const userId = state.session?.user.id;
  if (!userId) return emit({ profile: undefined });
  const { data, error } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name")
    .eq("id", userId)
    .maybeSingle();
  // On a network failure keep whatever we had rather than bouncing the user.
  if (error) {
    if (state.profile === undefined) emit({ profile: null });
    return;
  }
  emit({ profile: data });
}

export function setPendingInvite(token: string | null) {
  emit({ pendingInvite: token });
}

function start() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => {
    emit({ session: data.session });
    void refreshProfile();
  });
  supabase.auth.onAuthStateChange((_event, next) => {
    const changedUser = next?.user.id !== state.session?.user.id;
    emit({ session: next, profile: changedUser ? undefined : state.profile });
    if (changedUser) void refreshProfile();
  });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
