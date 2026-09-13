import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type ProkClient = ReturnType<typeof createProkClient>;

/**
 * Creates a typed Supabase client for Pro-K-Logic.
 *
 * `options.storage` is an auth storage adapter (expo-secure-store on mobile,
 * omitted on web so supabase-js falls back to localStorage).
 */
export function createProkClient(
  url: string,
  key: string,
  options?: { storage?: any },
) {
  return createClient<Database>(url, key, {
    auth: {
      storage: options?.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
