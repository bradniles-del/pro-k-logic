import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useAuthState } from "../lib/auth-state";
import { colors } from "../lib/ui";

/**
 * Root layout: gates navigation on the auth session and the profile.
 *   signed out                 -> /sign-in
 *   signed in, no organization -> /onboarding (invite code or create company)
 *   signed in, organization    -> (app)
 * /onboarding stays reachable to a member so an invite link can add them to
 * a second project; the screen itself sends them home when nothing is pending.
 */
export default function RootLayout() {
  const { session, profile, pendingInvite } = useAuthState();
  const segments = useSegments();
  const router = useRouter();

  const loading = session === undefined || (session !== null && profile === undefined);

  useEffect(() => {
    if (loading) return;
    const top = segments[0] as string | undefined;
    const inApp = top === "(app)";
    const onOnboarding = top === "onboarding";
    const onInvite = top === "invite";

    if (!session) {
      if (top !== "sign-in") router.replace("/sign-in");
      return;
    }
    if (pendingInvite) {
      if (!onOnboarding) router.replace({ pathname: "/onboarding", params: { invite: pendingInvite } });
      return;
    }
    const hasOrg = !!profile?.organization_id;
    if (!hasOrg) {
      if (!onOnboarding && !onInvite) router.replace("/onboarding");
      return;
    }
    if (!inApp && !onOnboarding && !onInvite) router.replace("/(app)");
  }, [loading, session, profile, pendingInvite, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontSize: 22, fontWeight: "700" },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
      <Stack.Screen name="onboarding" options={{ title: "Get started", headerBackVisible: false }} />
      <Stack.Screen name="invite/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
