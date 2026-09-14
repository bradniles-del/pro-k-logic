import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Database, Json, ProjectRole } from "@prok/shared";
import { supabase } from "./supabase";

/**
 * Thin query layer for the mobile app. Every function throws an Error with a
 * message safe to show; use describeError() to turn any failure into copy.
 */

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums = Database["public"]["Enums"];

export type Project = Pick<Row<"projects">, "id" | "name" | "code">;
export type HandlingUnit = Row<"handling_units">;
export type UnitContent = Row<"unit_contents">;
export type CustodyEvent = Row<"custody_events">;
export type Release = Row<"shipping_releases">;
export type ReleaseLine = Row<"release_lines">;
export type MaterialHit = Database["public"]["Functions"]["find_material"]["Returns"][number];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OfflineError extends Error {
  constructor() {
    super("No connection. Check your signal and try again.");
    this.name = "OfflineError";
  }
}

function isNetworkFailure(message: string): boolean {
  return /network request failed|failed to fetch|fetch failed|network error|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(
    message,
  );
}

function fail(message: string): never {
  if (isNetworkFailure(message)) throw new OfflineError();
  throw new Error(message);
}

function check(res: { error: { message: string } | null }): void {
  if (res.error) fail(res.error.message);
}

/** Copy for any thrown value; network failures become "No connection". */
export function describeError(e: unknown): string {
  if (e instanceof OfflineError) return e.message;
  const message = e instanceof Error ? e.message : String(e);
  if (isNetworkFailure(message)) return new OfflineError().message;
  return message;
}

export function isOffline(e: unknown): boolean {
  return e instanceof OfflineError || (e instanceof Error && isNetworkFailure(e.message));
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function acceptInvitation(token: string): Promise<Project> {
  const res = await supabase.rpc("accept_invitation", { p_token: token.trim() });
  check(res);
  if (!res.data) fail("Invitation could not be accepted");
  return { id: res.data.id, name: res.data.name, code: res.data.code };
}

export async function createOrganization(args: {
  name: string;
  kind: Enums["org_kind"];
  jurisdiction: string;
}): Promise<{ id: string; name: string }> {
  const res = await supabase.rpc("create_organization", {
    p_name: args.name.trim(),
    p_kind: args.kind,
    p_jurisdiction: args.jurisdiction,
  });
  check(res);
  if (!res.data) fail("Organization could not be created");
  return { id: res.data.id, name: res.data.name };
}

// ---------------------------------------------------------------------------
// Projects and the remembered selection
// ---------------------------------------------------------------------------

export type Membership = { role: ProjectRole; project: Project };

export async function listMyProjects(): Promise<Membership[]> {
  const res = await supabase.from("project_members").select("role, projects(id,name,code)");
  check(res);
  const out: Membership[] = [];
  for (const m of res.data ?? []) {
    if (m.projects) out.push({ role: m.role, project: m.projects });
  }
  out.sort((a, b) => a.project.name.localeCompare(b.project.name));
  return out;
}

const LAST_PROJECT_KEY = "prok.lastProjectId";
let lastProjectId: string | null = null;

/** Last project the user picked on Home; persisted in secure-store on device. */
export async function getLastProjectId(): Promise<string | null> {
  if (lastProjectId) return lastProjectId;
  if (Platform.OS === "web") return null;
  try {
    lastProjectId = await SecureStore.getItemAsync(LAST_PROJECT_KEY);
  } catch {
    lastProjectId = null;
  }
  return lastProjectId;
}

export function setLastProjectId(id: string): void {
  lastProjectId = id;
  if (Platform.OS === "web") return;
  SecureStore.setItemAsync(LAST_PROJECT_KEY, id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function findMaterial(projectId: string, query: string, limit = 30): Promise<MaterialHit[]> {
  const res = await supabase.rpc("find_material", { p_project_id: projectId, p_query: query.trim(), p_limit: limit });
  check(res);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/** Shape of the resolve_token RPC's JSON. `detail` is null when not visible. */
export type ResolvedToken =
  | { found: false }
  | {
      found: true;
      subject_type: "handling_unit";
      subject_id: string;
      /** 0 when the item was reached by short code rather than a QR token */
      token_version: number;
      voided: boolean;
      short_code: string;
      status: Enums["custody_status"];
      visible: boolean;
      detail: {
        description: string;
        project_id: string;
        shipment_id: string | null;
        zone_id: string | null;
      } | null;
    }
  | {
      found: true;
      subject_type: "release";
      subject_id: string;
      token_version: number;
      voided: boolean;
      visible: boolean;
      detail: { number: string; project_id: string; supplier_org_id: string } | null;
    };

function parseResolved(json: Json): ResolvedToken {
  if (!json || typeof json !== "object" || Array.isArray(json)) fail("Unexpected reply from server");
  const o = json as Record<string, Json | undefined>;
  if (o.found === false) return { found: false };
  if (o.found !== true || (o.subject_type !== "handling_unit" && o.subject_type !== "release")) {
    fail("Unexpected reply from server");
  }
  return o as unknown as ResolvedToken;
}

export async function resolveToken(token: string): Promise<ResolvedToken> {
  const res = await supabase.rpc("resolve_token", { p_token: token });
  check(res);
  return parseResolved(res.data);
}

/**
 * A paint-marked short code has no token. Look the unit up directly (RLS
 * decides visibility) and synthesise the same shape the RPC would return.
 * A unit that exists but is not visible reads as not found, which the item
 * screen explains together with the "ask your coordinator" hint.
 */
export async function resolveShortCode(shortCode: string): Promise<ResolvedToken> {
  const res = await supabase
    .from("handling_units")
    .select("id, short_code, description, current_status, current_project_id, current_shipment_id, current_zone_id")
    .eq("short_code", shortCode)
    .maybeSingle();
  check(res);
  const u = res.data;
  if (!u) return { found: false };
  return {
    found: true,
    subject_type: "handling_unit",
    subject_id: u.id,
    token_version: 0,
    voided: false,
    short_code: u.short_code,
    status: u.current_status,
    visible: true,
    detail: {
      description: u.description,
      project_id: u.current_project_id,
      shipment_id: u.current_shipment_id,
      zone_id: u.current_zone_id,
    },
  };
}

/** Active (non-voided, highest version) QR token for a unit, or null. */
export async function getUnitActiveToken(unitId: string): Promise<string | null> {
  const res = await supabase
    .from("qr_tokens")
    .select("token")
    .eq("subject_type", "handling_unit")
    .eq("subject_id", unitId)
    .is("voided_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  check(res);
  return res.data?.token ?? null;
}

// ---------------------------------------------------------------------------
// Handling unit detail
// ---------------------------------------------------------------------------

export type UnitDetail = {
  unit: HandlingUnit;
  releaseNumber: string | null;
  poNumber: string | null;
  zoneName: string | null;
  contents: UnitContent[];
  events: TimelineEvent[];
};

export type TimelineEvent = Pick<
  CustodyEvent,
  "id" | "type" | "occurred_at" | "location_name" | "notes" | "source"
> & { actorName: string | null; zoneName: string | null };

export async function getUnitDetail(unitId: string): Promise<UnitDetail> {
  const [unitRes, contentsRes, eventsRes] = await Promise.all([
    supabase
      .from("handling_units")
      .select("*, shipping_releases(number, purchase_orders(number)), zones(name)")
      .eq("id", unitId)
      .single(),
    supabase.from("unit_contents").select("*").eq("unit_id", unitId).order("created_at"),
    supabase
      .from("custody_events")
      .select("id, type, occurred_at, location_name, notes, source, profiles(full_name), zones(name)")
      .eq("subject_type", "handling_unit")
      .eq("subject_id", unitId)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);
  check(unitRes);
  check(contentsRes);
  check(eventsRes);
  if (!unitRes.data) fail("Item not found");

  const { shipping_releases, zones, ...unit } = unitRes.data;
  return {
    unit,
    releaseNumber: shipping_releases?.number ?? null,
    poNumber: shipping_releases?.purchase_orders?.number ?? null,
    zoneName: zones?.name ?? null,
    contents: contentsRes.data ?? [],
    events: (eventsRes.data ?? []).map(({ profiles, zones: z, ...e }) => ({
      ...e,
      actorName: profiles?.full_name || null,
      zoneName: z?.name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Shipping release (SRN) detail
// ---------------------------------------------------------------------------

export type ReleaseUnit = Pick<HandlingUnit, "id" | "short_code" | "description" | "current_status" | "kind">;

export type ReleaseDetail = {
  release: Release;
  supplierName: string | null;
  poNumber: string | null;
  lines: ReleaseLine[];
  units: ReleaseUnit[];
};

export async function getReleaseDetail(releaseId: string): Promise<ReleaseDetail> {
  const [relRes, linesRes, unitsRes] = await Promise.all([
    supabase
      .from("shipping_releases")
      .select("*, organizations(name), purchase_orders(number)")
      .eq("id", releaseId)
      .single(),
    supabase.from("release_lines").select("*").eq("release_id", releaseId).order("line_no"),
    supabase
      .from("handling_units")
      .select("id, short_code, description, current_status, kind")
      .eq("release_id", releaseId)
      .order("short_code"),
  ]);
  check(relRes);
  check(linesRes);
  check(unitsRes);
  if (!relRes.data) fail("SRN not found");

  const { organizations, purchase_orders, ...release } = relRes.data;
  return {
    release,
    supplierName: organizations?.name ?? null,
    poNumber: purchase_orders?.number ?? null,
    lines: linesRes.data ?? [],
    units: unitsRes.data ?? [],
  };
}
