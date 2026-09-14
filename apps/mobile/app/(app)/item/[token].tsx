import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  describeError,
  getReleaseDetail,
  getUnitActiveToken,
  getUnitDetail,
  resolveShortCode,
  resolveToken,
  type ReleaseDetail,
  type ReleaseUnit,
  type ResolvedToken,
  type TimelineEvent,
  type UnitDetail,
} from "../../../lib/api";
import { isShortCode } from "../../../lib/token";
import { Banner, BigButton, Centered, Field, StatusChip, colors, layout, type } from "../../../lib/ui";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "not_found" }
  | { phase: "not_visible"; resolved: ResolvedToken & { found: true } }
  | { phase: "unit"; resolved: ResolvedToken & { found: true; subject_type: "handling_unit" }; detail: UnitDetail }
  | { phase: "release"; resolved: ResolvedToken & { found: true; subject_type: "release" }; detail: ReleaseDetail };

/**
 * Item screen for a scanned QR token or a typed short code. resolve_token
 * decides what the viewer may see; the detail queries run only when it says
 * visible (RLS enforces the same boundary server-side).
 */
export default function Item() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const param = typeof token === "string" ? token.trim() : "";
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    if (!param) return setState({ phase: "not_found" });
    try {
      const resolved = isShortCode(param) ? await resolveShortCode(param) : await resolveToken(param);
      if (!resolved.found) return setState({ phase: "not_found" });
      if (!resolved.visible || !resolved.detail) return setState({ phase: "not_visible", resolved });
      if (resolved.subject_type === "handling_unit") {
        const detail = await getUnitDetail(resolved.subject_id);
        setState({ phase: "unit", resolved, detail });
      } else {
        const detail = await getReleaseDetail(resolved.subject_id);
        setState({ phase: "release", resolved, detail });
      }
    } catch (e) {
      setState({ phase: "error", message: describeError(e) });
    }
  }, [param]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  if (state.phase === "error") {
    return (
      <Centered>
        <Banner tone="warn">{state.message}</Banner>
        <BigButton title="Try again" huge onPress={() => void load()} />
        <BigButton title="Back" variant="secondary" onPress={() => router.back()} />
      </Centered>
    );
  }

  if (state.phase === "not_found") {
    return (
      <Centered>
        <Text style={type.h2}>Not found</Text>
        <Text style={[type.body, styles.centerText]}>
          This code is not in Pro-K-Logic, or it belongs to a project you are not on. Ask your coordinator to add
          you to this project.
        </Text>
        <Text style={[type.mono, styles.centerText]}>{param}</Text>
        <BigButton title="Scan again" huge onPress={() => router.back()} />
      </Centered>
    );
  }

  if (state.phase === "not_visible") {
    return (
      <Centered>
        {state.resolved.voided && <Banner tone="danger">This label was voided. Use the reprinted label.</Banner>}
        <Text style={type.h2}>Not on this project</Text>
        <Text style={[type.body, styles.centerText]}>Ask your coordinator to add you to this project.</Text>
        {state.resolved.subject_type === "handling_unit" && (
          <Text style={[type.mono, styles.centerText]}>{state.resolved.short_code}</Text>
        )}
        <BigButton title="Scan again" huge onPress={() => router.back()} />
      </Centered>
    );
  }

  return (
    <ScrollView style={layout.screen} contentContainerStyle={layout.content}>
      {state.resolved.voided && (
        <Banner tone="danger">This label was voided. Use the reprinted label (v{state.resolved.token_version} scanned).</Banner>
      )}
      {state.phase === "unit" ? <UnitView detail={state.detail} /> : <ReleaseView detail={state.detail} />}
      <ComingSoonActions />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Handling unit
// ---------------------------------------------------------------------------

function UnitView({ detail }: { detail: UnitDetail }) {
  const { unit, contents, events } = detail;
  const where = unit.current_location_name || detail.zoneName || null;
  return (
    <>
      <Text selectable style={styles.shortCode}>
        {unit.short_code}
      </Text>
      <StatusChip status={unit.current_status} />
      <Text style={type.h2}>{unit.description || "(no description)"}</Text>

      <View style={layout.card}>
        <Field label="Location" value={where ? where : "Not yet placed"} />
        <Field label="SRN" value={detail.releaseNumber} />
        <Field label="PO" value={detail.poNumber} />
        <Field label="Kind" value={unit.kind} />
      </View>

      <View style={styles.section}>
        <Text style={type.label}>Contents ({contents.length})</Text>
        {contents.length === 0 && <Text style={type.muted}>No contents listed.</Text>}
        {contents.map((c) => (
          <View key={c.id} style={layout.row}>
            <Text style={type.body}>{c.description}</Text>
            <Text style={type.muted}>
              {fmtQty(c.qty)} {c.uom}
              {c.piece_mark ? ` · ${c.piece_mark}` : ""}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={type.label}>History</Text>
        {events.length === 0 && <Text style={type.muted}>No events yet.</Text>}
        {events.map((e) => (
          <Timeline key={e.id} e={e} />
        ))}
      </View>
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  released: "Released",
  assigned_to_shipment: "Assigned to shipment",
  picked_up: "Picked up",
  tracking_started: "Tracking started",
  tracking_paused: "Tracking paused",
  tracking_resumed: "Tracking resumed",
  permission_lost: "Location permission lost",
  consent_revoked: "Consent withdrawn",
  tracking_ended: "Tracking ended",
  ping: "Location ping",
  approach_ring_crossed: "Approaching site",
  border_crossed: "Border crossed",
  arrived: "Arrived",
  delivered: "Delivered",
  received: "Received",
  inspected: "Inspected",
  stored: "Stored",
  moved: "Moved",
  split: "Split",
  transferred_to_project: "Transferred to project",
  issued: "Issued",
  installed: "Installed",
  exception: "Exception",
  void: "Voided",
  correction: "Correction",
  safety_checkin: "Safety check-in",
};

function Timeline({ e }: { e: TimelineEvent }) {
  const where = e.location_name || e.zoneName;
  return (
    <View style={styles.event}>
      <View style={styles.dotCol}>
        <View style={styles.dot} />
        <View style={styles.line} />
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventType}>{EVENT_LABEL[e.type] ?? e.type}</Text>
        <Text style={type.muted}>{fmtWhen(e.occurred_at)}</Text>
        <Text style={type.muted}>
          {e.actorName ?? "System"}
          {where ? ` · ${where}` : ""}
        </Text>
        {e.notes ? <Text style={type.body}>{e.notes}</Text> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shipping release (SRN)
// ---------------------------------------------------------------------------

function ReleaseView({ detail }: { detail: ReleaseDetail }) {
  const router = useRouter();
  const { release, lines, units } = detail;
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function openUnit(u: ReleaseUnit) {
    setOpening(u.id);
    setOpenError(null);
    try {
      // Prefer the unit's live QR token so the page shows voided/version state;
      // fall back to the short code, which resolves through RLS.
      const t = await getUnitActiveToken(u.id);
      router.push({ pathname: "/(app)/item/[token]", params: { token: t ?? u.short_code } });
    } catch (e) {
      setOpenError(describeError(e));
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <Text style={type.label}>SRN</Text>
      <Text selectable style={styles.shortCode}>
        {release.number}
      </Text>
      <View style={layout.card}>
        <Field label="Supplier" value={detail.supplierName} />
        <Field label="PO" value={detail.poNumber} />
        <Field label="Supplier ref" value={release.supplier_ref} />
        <Field label="Issued" value={fmtWhen(release.issued_at)} />
      </View>

      <View style={styles.section}>
        <Text style={type.label}>Lines ({lines.length})</Text>
        {lines.length === 0 && <Text style={type.muted}>No lines yet.</Text>}
        {lines.map((l) => (
          <View key={l.id} style={layout.row}>
            <Text style={type.body}>
              {l.line_no}. {l.description}
            </Text>
            <Text style={type.muted}>
              {fmtQty(l.qty)} {l.uom}
              {l.piece_mark ? ` · ${l.piece_mark}` : ""}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={type.label}>Units ({units.length})</Text>
        {openError && <Banner tone="warn">{openError}</Banner>}
        {units.length === 0 && <Text style={type.muted}>No handling units yet.</Text>}
        {units.map((u) => (
          <Pressable
            key={u.id}
            accessibilityRole="button"
            disabled={opening !== null}
            onPress={() => void openUnit(u)}
            style={({ pressed }) => [styles.unitRow, pressed && styles.pressed]}
          >
            <View style={styles.unitRowText}>
              <Text style={styles.unitCode}>{u.short_code}</Text>
              <Text style={type.body} numberOfLines={2}>
                {u.description || u.kind}
              </Text>
            </View>
            {opening === u.id ? <ActivityIndicator color={colors.primary} /> : <StatusChip status={u.current_status} />}
          </Pressable>
        ))}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Actions placeholder (wired in Phase 2/3)
// ---------------------------------------------------------------------------

function ComingSoonActions() {
  return (
    <View style={styles.actions}>
      <Text style={type.label}>Actions</Text>
      <Text style={type.muted}>Coming in the next update</Text>
      <BigButton title="Start tracking" disabled />
      <BigButton title="Store here" disabled />
      <BigButton title="Moved" disabled />
    </View>
  );
}

// ---------------------------------------------------------------------------

function fmtQty(q: number | string): string {
  const n = typeof q === "number" ? q : Number(q);
  return Number.isFinite(n) ? String(Number(n.toFixed(3))) : String(q);
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  centerText: { textAlign: "center" },
  shortCode: { fontSize: 40, fontWeight: "700", fontFamily: "monospace", color: colors.text, letterSpacing: 1 },
  section: { gap: 8, marginTop: 8 },
  event: { flexDirection: "row", gap: 14 },
  dotCol: { width: 16, alignItems: "center" },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, marginTop: 6 },
  line: { flex: 1, width: 3, backgroundColor: colors.line, marginTop: 4 },
  eventBody: { flex: 1, paddingBottom: 18, gap: 2 },
  eventType: { fontSize: 22, fontWeight: "700", color: colors.text },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  unitRowText: { flex: 1, gap: 2 },
  unitCode: { fontSize: 22, fontWeight: "700", fontFamily: "monospace", color: colors.text },
  pressed: { backgroundColor: colors.surface },
  actions: { gap: 12, marginTop: 24, paddingTop: 20, borderTopWidth: 2, borderColor: colors.line },
});
