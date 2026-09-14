import { Stack } from "expo-router";
import { colors } from "../../lib/ui";

/** Home -> Scan -> Item. Scan owns the whole screen; the rest keep a plain header. */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontSize: 22, fontWeight: "700" },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Home" }} />
      <Stack.Screen name="scan" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="item/[token]" options={{ title: "Item" }} />
    </Stack>
  );
}
