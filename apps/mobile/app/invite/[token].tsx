import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setPendingInvite } from "../../lib/auth-state";
import { Centered, colors } from "../../lib/ui";

/**
 * Deep link target for prok://invite/<token>. Stores the token so it survives
 * sign-in, then hands off to /onboarding?invite=<token>; the root gate does the
 * same for a user who is not signed in yet.
 */
export default function InviteLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    const t = typeof token === "string" ? token.trim() : "";
    if (!t) {
      router.replace("/onboarding");
      return;
    }
    setPendingInvite(t);
    router.replace({ pathname: "/onboarding", params: { invite: t } });
  }, [token, router]);

  return (
    <Centered>
      <ActivityIndicator size="large" color={colors.primary} />
    </Centered>
  );
}
