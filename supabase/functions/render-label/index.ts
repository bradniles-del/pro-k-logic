// render-label: build a PDF of QR labels for handling units, or the paperwork
// block for a shipping release, store it in the private `labels` bucket and
// return a short-lived signed URL.
//
// POST /functions/v1/render-label      (Authorization: Bearer <user JWT>)
//   { kind: "units",   ids: string[],      format?: "thermal-4x6" | "letter-grid" }
//   { kind: "release", release_id: string }
// -> { url, path, count }
//
// Reads go through a user-scoped client so RLS decides what the caller can
// see: ids outside their projects simply come back empty (404). Only the
// upload uses the service role, because `labels` has no insert policy for
// users on purpose (labels are produced here, never uploaded by hand).

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  LabelFormat,
  LabelRelease,
  LabelUnit,
  renderPaperworkBlock,
  renderUnitLabels,
} from "../_shared/label-pdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Web origin the QR points at; the app serves /s/:token. Placeholder until DNS is set up.
const WEB_BASE_URL = Deno.env.get("WEB_BASE_URL") ?? "https://app.pro-k-logic.com";

const BUCKET = "labels";
const SIGNED_URL_SECONDS = 600;
const MAX_UNITS = 500;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-region, x-retry-count, x-supabase-client-platform, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UnitsBody = { kind: "units"; ids: string[]; format?: LabelFormat };
type ReleaseBody = { kind: "release"; release_id: string };

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBody(raw: unknown): UnitsBody | ReleaseBody {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "JSON body required");
  const b = raw as Record<string, unknown>;
  if (b.kind === "units") {
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : [];
    const unique = [...new Set(ids.map((s) => s.trim().toLowerCase()))];
    if (unique.length === 0) throw new HttpError(400, "ids: non-empty array of unit ids required");
    if (unique.length > MAX_UNITS) throw new HttpError(400, `ids: at most ${MAX_UNITS} units per request`);
    if (!unique.every((id) => UUID_RE.test(id))) throw new HttpError(400, "ids: every id must be a uuid");
    const format = b.format ?? "thermal-4x6";
    if (format !== "thermal-4x6" && format !== "letter-grid") {
      throw new HttpError(400, "format must be 'thermal-4x6' or 'letter-grid'");
    }
    return { kind: "units", ids: unique, format };
  }
  if (b.kind === "release") {
    const id = typeof b.release_id === "string" ? b.release_id.trim().toLowerCase() : "";
    if (!UUID_RE.test(id)) throw new HttpError(400, "release_id: uuid required");
    return { kind: "release", release_id: id };
  }
  throw new HttpError(400, "kind must be 'units' or 'release'");
}

// ---------------------------------------------------------------------------
// Data access (user-scoped client, RLS applies)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

// Column lists are plain strings here, so postgrest-js cannot infer row
// types; callers name the shape they expect.
async function must<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new HttpError(500, `database: ${error.message}`);
  return (data ?? []) as T;
}

/** Active token (voided_at is null, highest version) per subject id. */
async function activeTokens(db: SupabaseClient, subjectType: "handling_unit" | "release", subjectIds: string[]) {
  const rows = await must<Row[]>(
    db.from("qr_tokens")
      .select("subject_id, token, version")
      .eq("subject_type", subjectType)
      .in("subject_id", subjectIds)
      .is("voided_at", null)
      .order("version", { ascending: false }),
  );
  const byId = new Map<string, string>();
  for (const r of rows) {
    const id = r.subject_id as string;
    if (!byId.has(id)) byId.set(id, r.token as string); // first seen = highest version
  }
  return byId;
}

async function lookupByIds(db: SupabaseClient, table: string, columns: string, ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  if (ids.length === 0) return out;
  const rows = await must<Row[]>(db.from(table).select(columns).in("id", ids));
  for (const r of rows) out.set(r.id as string, r);
  return out;
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

async function loadUnits(db: SupabaseClient, ids: string[]): Promise<{ units: LabelUnit[]; projectId: string }> {
  const units = await must<Row[]>(
    db.from("handling_units")
      .select("id, short_code, description, kind, weight_kg, release_id, current_project_id, created_at")
      .in("id", ids),
  );
  if (units.length === 0) throw new HttpError(404, "no visible handling units for those ids");
  const found = new Set(units.map((u) => u.id as string));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new HttpError(404, "some units are not visible", { missing });

  const releaseIds = uniq(units.map((u) => u.release_id as string | null));
  const releases = await lookupByIds(db, "shipping_releases", "id, number, po_id, project_id", releaseIds);
  const pos = await lookupByIds(db, "purchase_orders", "id, number", uniq([...releases.values()].map((r) => r.po_id as string | null)));
  const projects = await lookupByIds(db, "projects", "id, code, name", uniq(units.map((u) => u.current_project_id as string)));
  const tokens = await activeTokens(db, "handling_unit", ids);

  // "n of N" is the unit's position within its release (by creation order),
  // counted over the whole release, not just the units being printed.
  const positions = new Map<string, { index: number; total: number }>();
  if (releaseIds.length) {
    const siblings = await must<Row[]>(
      db.from("handling_units")
        .select("id, release_id, created_at")
        .in("release_id", releaseIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );
    const counters = new Map<string, number>();
    const releaseOf = new Map<string, string>();
    for (const s of siblings) {
      const rid = s.release_id as string;
      const n = (counters.get(rid) ?? 0) + 1;
      counters.set(rid, n);
      releaseOf.set(s.id as string, rid);
      positions.set(s.id as string, { index: n, total: 0 });
    }
    for (const [id, p] of positions) p.total = counters.get(releaseOf.get(id)!) ?? p.index;
  }

  const noToken = units.filter((u) => !tokens.has(u.id as string)).map((u) => u.id as string);
  if (noToken.length) throw new HttpError(409, "units without an active QR token (reissue first)", { ids: noToken });

  // keep the caller's order
  const byId = new Map(units.map((u) => [u.id as string, u]));
  const labels: LabelUnit[] = ids.map((id, i) => {
    const u = byId.get(id)!;
    const rel = u.release_id ? releases.get(u.release_id as string) : undefined;
    const po = rel?.po_id ? pos.get(rel.po_id as string) : undefined;
    const proj = projects.get(u.current_project_id as string);
    const pos_ = positions.get(id) ?? { index: i + 1, total: ids.length };
    return {
      token: tokens.get(id)!,
      short_code: u.short_code as string,
      description: (u.description as string) ?? "",
      kind: (u.kind as string) ?? "unit",
      index: pos_.index,
      total: pos_.total,
      srn_number: (rel?.number as string) ?? "—",
      po_number: (po?.number as string) ?? null,
      project_code: (proj?.code as string) ?? (proj?.name as string) ?? null,
      weight_kg: u.weight_kg == null ? null : Number(u.weight_kg),
    };
  });
  return { units: labels, projectId: units[0].current_project_id as string };
}

async function loadRelease(db: SupabaseClient, releaseId: string): Promise<{ release: LabelRelease; projectId: string }> {
  const rows = await must<Row[]>(
    db.from("shipping_releases").select("id, number, po_id, project_id, supplier_org_id").in("id", [releaseId]),
  );
  if (rows.length === 0) throw new HttpError(404, "release not found");
  const r = rows[0];
  const [pos, projects, orgs, tokens, lineCount] = await Promise.all([
    lookupByIds(db, "purchase_orders", "id, number", uniq([r.po_id as string | null])),
    lookupByIds(db, "projects", "id, code, name", [r.project_id as string]),
    lookupByIds(db, "organizations", "id, name", uniq([r.supplier_org_id as string | null])),
    activeTokens(db, "release", [releaseId]),
    db.from("release_lines").select("id", { count: "exact", head: true }).eq("release_id", releaseId),
  ]);
  const token = tokens.get(releaseId);
  if (!token) throw new HttpError(409, "release has no active QR token (reissue first)");
  const proj = projects.get(r.project_id as string);
  return {
    release: {
      token,
      srn_number: r.number as string,
      po_number: (pos.get(r.po_id as string)?.number as string) ?? null,
      project_code: (proj?.code as string) ?? (proj?.name as string) ?? null,
      supplier_name: (orgs.get(r.supplier_org_id as string)?.name as string) ?? "",
      line_count: lineCount.count ?? 0,
    },
    projectId: r.project_id as string,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "missing bearer token");

    const user = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: authErr } = await user.auth.getUser();
    if (authErr || !who?.user) throw new HttpError(401, "invalid or expired token");

    const body = parseBody(await req.json().catch(() => null));

    let pdf: Uint8Array;
    let projectId: string;
    let count: number;
    let firstId: string;
    if (body.kind === "units") {
      const { units, projectId: pid } = await loadUnits(user, body.ids);
      pdf = await renderUnitLabels(units, { format: body.format, baseUrl: WEB_BASE_URL });
      projectId = pid;
      count = units.length;
      firstId = body.ids[0];
    } else {
      const { release, projectId: pid } = await loadRelease(user, body.release_id);
      pdf = await renderPaperworkBlock(release, { baseUrl: WEB_BASE_URL });
      projectId = pid;
      count = 1;
      firstId = body.release_id;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const path = `${projectId}/${body.kind}-${firstId}-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw new HttpError(500, `storage upload: ${upErr.message}`);

    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signErr || !signed) throw new HttpError(500, `signed url: ${signErr?.message ?? "unknown"}`);

    return json(200, { url: signed.signedUrl, path, count });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, ...e.extra });
    console.error("render-label", e);
    return json(500, { error: e instanceof Error ? e.message : "internal error" });
  }
});
