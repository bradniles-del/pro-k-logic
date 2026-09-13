import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { createProkClient } from "@prok/shared";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. Copy apps/mobile/.env.example to .env.",
  );
}

// expo-secure-store is not available on web; fall back to localStorage there.
const secureStoreAdapter = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

export const supabase = createProkClient(url, key, {
  storage: Platform.OS === "web" ? undefined : secureStoreAdapter,
});

// Refresh the session while the app is in the foreground, stop when backgrounded.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
