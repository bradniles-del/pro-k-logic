// Thin query layer over supabase-js so pages stay small. Every function
// throws on error (callers catch and show the message) and returns typed rows.
import type { Database, Json } from "@prok/shared";
import { FunctionRegion, type PostgrestSingleResponse } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Enums = Database["public"]["Enums"];

export type Profile = Row<"profiles">;
export type Project = Row<"projects">;
export type Organization = Row<"organizations">;
export type Release = Row<"shipping_releases">;
export type ReleaseLine = Row<"release_lines">;
export type Document = Row<"documents">;
export type ExtractionJob = Row<"extraction_jobs">;
export type HandlingUnit = Row<"handling_units">;
export type UnitContent = Row<"unit_contents">;
export type Shipment = Row<"shipments">;
export type ShipmentUpdate = Row<"shipment_updates">;
export type CustodyEvent = Row<"custody_events">;
export type PurchaseOrder = Row<"purchase_orders">;
export type QrToken = Row<"qr_tokens">;

/**
 * Edge functions live in ca-central-1. The `region` option makes supabase-js
 * set the x-region header itself; we keep the explicit header too so the pin
 * survives a client-library change.
 */
const FN_REGION = FunctionRegion.CaCentral1;
const FN_HEADERS = { "x-region": "ca-central-1" };

/** Throws on error or empty data; returns the row. */
function unwrap<T>(res: PostgrestSingleResponse<T>): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error("No data returned");
  return res.data;
}

function check(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// Profile, onboarding, projects
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  check(res);
  return res.data;
}

export async function createOrganization(args: {
  name: string;
  kind: Enums["org_kind"];
  jurisdiction: string;
}): Promise<Organization> {
  return unwrap(
    await supabase.rpc("create_organization", {
      p_name: args.name,
      p_kind: args.kind,
      p_jurisdiction: args.jurisdiction,
    }),
  );
}

export async function createProject(args: {
  name: string;
  code: string | null;
  timezone: string;
  lat: number | null;
  lng: number | null;
}): Promise<Project> {
  // The generated Args type marks p_lat/p_lng as required numbers; the SQL
  // function accepts null (no site point), so we widen the type here.
  const params = {
    p_name: args.name,
    p_code: args.code,
    p_timezone: args.timezone,
    p_lat: args.lat,
    p_lng: args.lng,
  } as unknown as Database["public"]["Functions"]["create_project"]["Args"];
  return unwrap(await supabase.rpc("create_project", params));
}

export async function acceptInvitation(token: string): Promise<Project> {
  return unwrap(await supabase.rpc("accept_invitation", { p_token: token }));
}

export type Membership = {
  role: Enums["project_role"];
  projects: Pick<Project, "id" | "name" | "code" | "timezone"> | null;
};

export async function listMemberships(): Promise<Membership[]> {
  const res = await supabase.from("project_members").select("role, projects(id,name,code,timezone)");
  check(res);
  return (res.data ?? []) as Membership[];
}

export async function getProject(projectId: string): Promise<Project> {
  return unwrap(await supabase.from("projects").select("*").eq("id", projectId).single());
}

export async function myRoleOn(projectId: string): Promise<Enums["project_role"] | null> {
  const res = await supabase.rpc("project_role_of", { p: projectId });
  check(res);
  return res.data ?? null;
}

export type ProjectOrg = {
  organization_id: string;
  organizations: Pick<Organization, "id" | "name" | "kind" | "is_placeholder"> | null;
};

export async function listProjectOrgs(projectId: string): Promise<ProjectOrg[]> {
  const res = await supabase
    .from("project_organizations")
    .select("organization_id, organizations(id,name,kind,is_placeholder)")
    .eq("project_id", projectId);
  check(res);
  const rows = (res.data ?? []) as ProjectOrg[];
  return rows.sort((a, b) => (a.organizations?.name ?? "").localeCompare(b.organizations?.name ?? ""));
}

/**
 * Creates a placeholder organization (no members yet) and attaches it to the
 * project. The id is generated client-side because the org is not selectable
 * by the caller until the project_organizations row exists.
 */
export async function createPlaceholderOrg(args: {
  projectId: string;
  name: string;
  contactEmail: string | null;
  kind: Enums["org_kind"];
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  check(
    await supabase.from("organizations").insert({
      id,
      name: args.name,
      kind: args.kind,
      is_placeholder: true,
      contact_email: args.contactEmail,
    }),
  );
  check(
    await supabase
      .from("project_organizations")
      .insert({ project_id: args.projectId, organization_id: id, invited_by: args.userId }),
  );
  return id;
}

// ---------------------------------------------------------------------------
// Purchase orders and SRNs (shipping releases)
// ---------------------------------------------------------------------------

export async function listPurchaseOrders(projectId: string): Promise<PurchaseOrder[]> {
  const res = await supabase.from("purchase_orders").select("*").eq("project_id", projectId).order("number");
  check(res);
  return res.data ?? [];
}

export async function createPurchaseOrder(args: {
  projectId: string;
  number: string;
  supplierOrgId: string | null;
  userId: string;
}): Promise<PurchaseOrder> {
  return unwrap(
    await supabase
      .from("purchase_orders")
      .insert({
        project_id: args.projectId,
        number: args.number,
        supplier_org_id: args.supplierOrgId,
        created_by: args.userId,
      })
      .select("*")
      .single(),
  );
}

export type ReleaseListRow = Release & {
  organizations: Pick<Organization, "name"> | null;
  purchase_orders: Pick<PurchaseOrder, "number"> | null;
  release_lines: { id: string }[];
  handling_units: { id: string }[];
  shipments: { current_status: Enums["custody_status"] }[];
};

export async function listReleases(projectId: string): Promise<ReleaseListRow[]> {
  const res = await supabase
    .from("shipping_releases")
    .select(
      "*, organizations(name), purchase_orders(number), release_lines(id), handling_units(id), shipments(current_status)",
    )
    .eq("project_id", projectId)
    .order("issued_at", { ascending: false });
  check(res);
  return (res.data ?? []) as ReleaseListRow[];
}

export type ReleaseDetail = Release & {
  organizations: Pick<Organization, "id" | "name"> | null;
  purchase_orders: Pick<PurchaseOrder, "id" | "number"> | null;
};

export async function getRelease(releaseId: string): Promise<ReleaseDetail> {
  const res = await supabase
    .from("shipping_releases")
    .select("*, organizations(id,name), purchase_orders(id,number)")
    .eq("id", releaseId)
    .single();
  return unwrap(res) as ReleaseDetail;
}

export async function createRelease(args: {
  projectId: string;
  supplierOrgId: string;
  poId: string | null;
  number: string;
  supplierRef: string | null;
  notes: string | null;
  userId: string;
}): Promise<Release> {
  return unwrap(
    await supabase
      .from("shipping_releases")
      .insert({
        project_id: args.projectId,
        supplier_org_id: args.supplierOrgId,
        po_id: args.poId,
        number: args.number,
        supplier_ref: args.supplierRef,
        notes: args.notes,
        issued_by: args.userId,
      })
      .select("*")
      .single(),
  );
}

/** Current (highest version) token for a release or unit. */
export async function getCurrentToken(
  subjectType: "release" | "handling_unit",
  subjectId: string,
): Promise<QrToken | null> {
  const res = await supabase
    .from("qr_tokens")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  check(res);
  return res.data;
}

// ---------------------------------------------------------------------------
// Release lines
// ---------------------------------------------------------------------------

export async function listReleaseLines(releaseId: string): Promise<ReleaseLine[]> {
  const res = await supabase.from("release_lines").select("*").eq("release_id", releaseId).order("line_no");
  check(res);
  return res.data ?? [];
}

export type ReleaseLineInput = Omit<Tables["release_lines"]["Insert"], "release_id" | "search">;

export async function insertReleaseLines(releaseId: string, lines: ReleaseLineInput[]): Promise<void> {
  if (lines.length === 0) return;
  check(await supabase.from("release_lines").insert(lines.map((l) => ({ ...l, release_id: releaseId }))));
}

export async function updateReleaseLine(
  id: string,
  patch: Pick<Tables["release_lines"]["Update"], "line_no" | "description" | "qty" | "uom" | "piece_mark">,
): Promise<void> {
  check(await supabase.from("release_lines").update(patch).eq("id", id));
}

export async function deleteReleaseLine(id: string): Promise<void> {
  check(await supabase.from("release_lines").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Documents and extraction
// ---------------------------------------------------------------------------

export async function listDocuments(releaseId: string): Promise<Document[]> {
  const res = await supabase
    .from("documents")
    .select("*")
    .eq("release_id", releaseId)
    .order("created_at", { ascending: false });
  check(res);
  return res.data ?? [];
}

export async function uploadDocument(args: {
  projectId: string;
  releaseId: string;
  file: File;
  kind: Enums["document_kind"];
  userId: string;
}): Promise<Document> {
  const safeName = args.file.name.replace(/[^\w.-]+/g, "_");
  const path = `${args.projectId}/releases/${args.releaseId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from("documents").upload(path, args.file, {
    contentType: args.file.type || undefined,
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);
  return unwrap(
    await supabase
      .from("documents")
      .insert({
        project_id: args.projectId,
        release_id: args.releaseId,
        kind: args.kind,
        storage_path: path,
        filename: args.file.name,
        mime_type: args.file.type || null,
        uploaded_by: args.userId,
      })
      .select("*")
      .single(),
  );
}

export async function signedDocumentUrl(storagePath: string, seconds = 120): Promise<string> {
  const res = await supabase.storage.from("documents").createSignedUrl(storagePath, seconds);
  if (res.error) throw new Error(res.error.message);
  return res.data.signedUrl;
}

export async function listExtractionJobs(releaseId: string): Promise<ExtractionJob[]> {
  const res = await supabase
    .from("extraction_jobs")
    .select("*")
    .eq("release_id", releaseId)
    .order("created_at", { ascending: false });
  check(res);
  return res.data ?? [];
}

export async function getExtractionJob(jobId: string): Promise<ExtractionJob> {
  return unwrap(await supabase.from("extraction_jobs").select("*").eq("id", jobId).single());
}

/** Inserts the job row and asks the edge function to run it. */
export async function requestExtraction(args: {
  projectId: string;
  documentId: string;
  releaseId: string;
  userId: string;
}): Promise<ExtractionJob> {
  const job = unwrap(
    await supabase
      .from("extraction_jobs")
      .insert({
        project_id: args.projectId,
        document_id: args.documentId,
        release_id: args.releaseId,
        requested_by: args.userId,
      })
      .select("*")
      .single(),
  );
  const fn = await supabase.functions
    .invoke<{ job_id: string; status: string; count: number }>("extract-bom", {
      body: { job_id: job.id },
      headers: FN_HEADERS,
      region: FN_REGION,
    })
    .catch(async (e: unknown) => {
      // The function never got the request; drop the queued row so the UI is not stuck.
      await deleteExtractionJob(job.id).catch(() => undefined);
      throw e;
    });
  if (fn.error) {
    const message = await describeFunctionError(fn.error, "extract-bom");
    // A transport / relay failure means the job was never claimed: clean it up.
    // (An HTTP error from the function itself already marked the job failed.)
    const status = (fn.error as { context?: Response }).context?.status;
    if (status === undefined || status === 404) await deleteExtractionJob(job.id).catch(() => undefined);
    throw new Error(message);
  }
  return job;
}

/** Requesters may delete their own queued/failed jobs (RLS: extraction_delete). */
export async function deleteExtractionJob(jobId: string): Promise<void> {
  check(await supabase.from("extraction_jobs").delete().eq("id", jobId));
}

/** Candidate line as written by extract-bom into extraction_jobs.candidates. */
export type Candidate = {
  line_no: number | null;
  piece_mark: string | null;
  description: string;
  qty: number | null;
  uom: string | null;
  page: number | null;
  raw: string | null;
  confidence: number;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : v === null || v === undefined ? null : String(v);
}

/** Defensive parse of the candidates JSON array. */
export function parseCandidates(json: Json): Candidate[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const o = item as Record<string, Json | undefined>;
    return [
      {
        line_no: num(o.line_no),
        piece_mark: str(o.piece_mark),
        description: str(o.description) ?? "",
        qty: num(o.qty),
        uom: str(o.uom),
        page: num(o.page ?? o.source_page),
        raw: str(o.raw ?? o.raw_text),
        confidence: num(o.confidence) ?? 0,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Handling units
// ---------------------------------------------------------------------------

export async function listUnitsForRelease(releaseId: string): Promise<HandlingUnit[]> {
  const res = await supabase
    .from("handling_units")
    .select("*")
    .eq("release_id", releaseId)
    .order("created_at", { ascending: true });
  check(res);
  return res.data ?? [];
}

export async function getUnit(unitId: string): Promise<HandlingUnit> {
  return unwrap(await supabase.from("handling_units").select("*").eq("id", unitId).single());
}

export async function listUnitContents(unitId: string): Promise<UnitContent[]> {
  const res = await supabase.from("unit_contents").select("*").eq("unit_id", unitId).order("created_at");
  check(res);
  return res.data ?? [];
}

export async function listUnitEvents(unitId: string, limit = 20): Promise<CustodyEvent[]> {
  const res = await supabase
    .from("custody_events")
    .select("*")
    .eq("subject_type", "handling_unit")
    .eq("subject_id", unitId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  check(res);
  return res.data ?? [];
}

export type NewUnitSpec = {
  kind: string;
  description: string;
  lines: ReleaseLine[]; // contents copied from these lines (provenance 'structured')
};

/**
 * Creates units and their contents. Ids are client-generated because the
 * unit's SELECT policy depends on a row an AFTER INSERT trigger writes, so a
 * RETURNING clause on the insert would be rejected.
 */
export async function createUnits(args: {
  projectId: string;
  releaseId: string;
  userId: string;
  specs: NewUnitSpec[];
}): Promise<string[]> {
  const ids = args.specs.map(() => crypto.randomUUID());
  check(
    await supabase.from("handling_units").insert(
      args.specs.map((s, i) => ({
        id: ids[i],
        release_id: args.releaseId,
        kind: s.kind,
        description: s.description,
        current_project_id: args.projectId,
        created_by: args.userId,
        short_code: "", // filled by trigger
      })),
    ),
  );
  const contents = args.specs.flatMap((s, i) =>
    s.lines.map((l) => ({
      unit_id: ids[i],
      release_line_id: l.id,
      po_line_id: l.po_line_id,
      description: l.description,
      qty: l.qty,
      uom: l.uom,
      piece_mark: l.piece_mark,
      provenance: "structured" as const,
      confirmed_by: args.userId,
    })),
  );
  if (contents.length > 0) check(await supabase.from("unit_contents").insert(contents));
  return ids;
}

// ---------------------------------------------------------------------------
// Shipments and updates
// ---------------------------------------------------------------------------

export type ShipmentRow = Shipment & { organizations: Pick<Organization, "name"> | null };

export async function listShipmentsForRelease(releaseId: string): Promise<ShipmentRow[]> {
  const res = await supabase
    .from("shipments")
    .select("*, organizations(name)")
    .eq("release_id", releaseId)
    .order("created_at");
  check(res);
  return (res.data ?? []) as ShipmentRow[];
}

export type ProjectShipment = Shipment & {
  shipping_releases: Pick<Release, "number"> | null;
  organizations: Pick<Organization, "name"> | null;
};

export async function listProjectShipments(projectId: string): Promise<ProjectShipment[]> {
  const res = await supabase
    .from("shipments")
    .select("*, shipping_releases(number), organizations(name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  check(res);
  return (res.data ?? []) as ProjectShipment[];
}

export async function createShipment(args: {
  projectId: string;
  releaseId: string;
  carrierOrgId: string | null;
  plannedPickupAt: string | null;
  plannedDeliveryAt: string | null;
  originText: string | null;
  userId: string;
}): Promise<void> {
  check(
    await supabase.from("shipments").insert({
      project_id: args.projectId,
      release_id: args.releaseId,
      carrier_org_id: args.carrierOrgId,
      planned_pickup_at: args.plannedPickupAt,
      planned_delivery_at: args.plannedDeliveryAt,
      origin_text: args.originText,
      created_by: args.userId,
    }),
  );
}

export type UpdateRow = ShipmentUpdate & {
  profiles: Pick<Profile, "full_name"> | null;
  shipments: (Pick<Shipment, "id"> & { shipping_releases: Pick<Release, "number"> | null }) | null;
};

export async function listUpdates(projectId: string, limit = 100): Promise<UpdateRow[]> {
  const res = await supabase
    .from("shipment_updates")
    .select("*, profiles(full_name), shipments(id, shipping_releases(number))")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  check(res);
  return (res.data ?? []) as UpdateRow[];
}

export class RateLimitError extends Error {}

export async function postUpdate(args: {
  projectId: string;
  shipmentId: string;
  kind: Enums["update_kind"];
  text: string;
  etaAt: string | null;
  userId: string;
}): Promise<void> {
  const res = await supabase.from("shipment_updates").insert({
    project_id: args.projectId,
    shipment_id: args.shipmentId,
    author_id: args.userId,
    kind: args.kind,
    text: args.text,
    eta_at: args.etaAt,
  });
  if (res.error) {
    if (res.error.code === "P0010" || /one update per minute/i.test(res.error.message)) {
      throw new RateLimitError("You already posted on this shipment in the last minute. Wait a moment and try again.");
    }
    throw new Error(res.error.message);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type MaterialHit = Database["public"]["Functions"]["find_material"]["Returns"][number];

export async function findMaterial(projectId: string, query: string, limit = 100): Promise<MaterialHit[]> {
  const res = await supabase.rpc("find_material", { p_project_id: projectId, p_query: query, p_limit: limit });
  check(res);
  return res.data ?? [];
}

export type LocationName = Database["public"]["Functions"]["project_location_names"]["Returns"][number];

export async function projectLocationNames(projectId: string): Promise<LocationName[]> {
  const res = await supabase.rpc("project_location_names", { p_project_id: projectId });
  check(res);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Labels (render-label edge function)
// ---------------------------------------------------------------------------

export type LabelFormat = "thermal-4x6" | "letter-grid";
export type RenderLabelResult = { url: string; path: string; count: number };

export async function renderUnitLabels(ids: string[], format: LabelFormat): Promise<RenderLabelResult> {
  const fn = await supabase.functions.invoke<RenderLabelResult>("render-label", {
    body: { kind: "units", ids, format },
    headers: FN_HEADERS,
    region: FN_REGION,
  });
  if (fn.error) throw new Error(await describeFunctionError(fn.error, "render-label"));
  if (!fn.data?.url) throw new Error("render-label returned no URL");
  return fn.data;
}

export async function renderReleasePaperwork(releaseId: string): Promise<RenderLabelResult> {
  const fn = await supabase.functions.invoke<RenderLabelResult>("render-label", {
    body: { kind: "release", release_id: releaseId },
    headers: FN_HEADERS,
    region: FN_REGION,
  });
  if (fn.error) throw new Error(await describeFunctionError(fn.error, "render-label"));
  if (!fn.data?.url) throw new Error("render-label returned no URL");
  return fn.data;
}

/** Turns a functions.invoke error into something a coordinator can act on. */
async function describeFunctionError(err: unknown, name: string): Promise<string> {
  const e = err as { name?: string; message?: string; context?: Response };
  const status = e.context?.status;
  if (status === 404 || e.name === "FunctionsFetchError") {
    return `The ${name} service is not available yet (not deployed or unreachable). Try again later.`;
  }
  let body = "";
  try {
    if (e.context && typeof e.context.text === "function") body = (await e.context.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  return `${name} failed${status ? ` (${status})` : ""}: ${body || e.message || "unknown error"}`;
}
