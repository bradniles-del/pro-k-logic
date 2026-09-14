import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { CustodyStatus } from "@prok/shared";

/**
 * Field-worker UI primitives. Gloves and sunlight: big targets (>= 64 px),
 * large high-contrast text, flat colours, no icons that need a legend.
 * StyleSheet only; no UI library.
 */

export const colors = {
  bg: "#FFFFFF",
  surface: "#F2F3F5",
  text: "#111111",
  muted: "#4A4F57",
  line: "#C9CDD3",
  primary: "#0B5FFF",
  primaryText: "#FFFFFF",
  danger: "#B00020",
  warn: "#FFB300",
  warnText: "#3D2A00",
  ok: "#1B8A3A",
  disabled: "#D7DAE0",
  disabledText: "#7A8088",
} as const;

export const type = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: "700", color: colors.text },
  h2: { fontSize: 24, fontWeight: "700", color: colors.text },
  body: { fontSize: 20, color: colors.text },
  label: { fontSize: 16, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  muted: { fontSize: 18, color: colors.muted },
  mono: { fontSize: 20, color: colors.text, fontFamily: "monospace" },
});

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  huge?: boolean;
  style?: ViewStyle;
};

/** Full-width button with a 64 px (or 120 px when `huge`) target. */
export function BigButton({ title, onPress, variant = "primary", disabled, busy, huge, style }: ButtonProps) {
  const off = disabled || busy;
  const bg =
    off ? colors.disabled : variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : colors.surface;
  const fg = off ? colors.disabledText : variant === "secondary" ? colors.text : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        btn.base,
        huge && btn.huge,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        variant === "secondary" && !off && btn.outlined,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="large" />
      ) : (
        <Text style={[btn.text, huge && btn.hugeText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: {
    minHeight: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  huge: { minHeight: 120, borderRadius: 16 },
  outlined: { borderWidth: 2, borderColor: colors.line },
  text: { fontSize: 22, fontWeight: "700" },
  hugeText: { fontSize: 32 },
});

/** Segmented row of choices; wraps on narrow screens. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={seg.row}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[seg.item, on && seg.on]}
          >
            <Text style={[seg.text, on && seg.onText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: {
    minHeight: 56,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 18, fontWeight: "600", color: colors.text },
  onText: { color: colors.primaryText },
});

const STATUS_LABEL: Record<CustodyStatus, string> = {
  released: "Released",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
  arrived: "Arrived",
  delivered: "Delivered",
  received: "Received",
  in_storage: "In storage",
  issued: "Issued",
  installed: "Installed",
  exception: "Exception",
};

const STATUS_COLOR: Partial<Record<CustodyStatus, string>> = {
  in_transit: colors.primary,
  arrived: colors.primary,
  delivered: colors.ok,
  received: colors.ok,
  in_storage: colors.ok,
  installed: colors.ok,
  exception: colors.danger,
};

export function StatusChip({ status }: { status: string }) {
  const s = status as CustodyStatus;
  const bg = STATUS_COLOR[s] ?? colors.muted;
  return (
    <View style={[chip.base, { backgroundColor: bg }]}>
      <Text style={chip.text}>{STATUS_LABEL[s] ?? status}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  base: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  text: { color: "#fff", fontSize: 18, fontWeight: "700" },
});

/** Full-width notice. `tone` picks the colour; text stays large. */
export function Banner({ tone, children }: { tone: "warn" | "danger" | "info"; children: ReactNode }) {
  const bg = tone === "warn" ? colors.warn : tone === "danger" ? colors.danger : colors.surface;
  const fg = tone === "warn" ? colors.warnText : tone === "danger" ? "#fff" : colors.text;
  return (
    <View style={[banner.base, { backgroundColor: bg }]}>
      <Text style={[banner.text, { color: fg }]}>{children}</Text>
    </View>
  );
}

const banner = StyleSheet.create({
  base: { borderRadius: 12, padding: 16 },
  text: { fontSize: 20, fontWeight: "600" },
});

/** Label above a value. */
export function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <View style={field.wrap}>
      <Text style={type.label}>{label}</Text>
      <Text style={mono ? type.mono : type.body}>{value && value.length > 0 ? value : "—"}</Text>
    </View>
  );
}

const field = StyleSheet.create({ wrap: { gap: 4 } });

export function Centered({ children }: { children: ReactNode }) {
  return <View style={layout.center}>{children}</View>;
}

export const layout = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.bg },
  input: {
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 22,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 8 },
});
