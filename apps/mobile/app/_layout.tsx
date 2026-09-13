import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/**
 * Root layout: subscribes to the auth session and gates navigation.
 * Signed-out users are sent to /sign-in; signed-in users to the (app) group.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading
    const inApp = segments[0] === "(app)";
    if (!session && inApp) router.replace("/sign-in");
    else if (session && !inApp) router.replace("/(app)");
  }, [session, segments, router]);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
