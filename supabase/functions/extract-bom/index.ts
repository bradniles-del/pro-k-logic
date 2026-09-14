// extract-bom: turn an uploaded SRN PDF into candidate BOM lines.
//
// POST { job_id }  (Authorization: Bearer <user JWT>, x-region: ca-central-1)
//   -> { job_id, status: 'done' | 'failed', count, method?, pages?, error? }
//
// The caller must be able to read the extraction_jobs row (RLS: project
// member). Status/result columns are written with the service role because
// extraction_jobs has no update policy for users (see migration 0011).
// Data stays in-region: the PDF is downloaded from Storage inside the function
// and only its extracted TEXT is sent to the Anthropic API when
// ANTHROPIC_API_KEY is set (see supabase/functions/README.md).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MODEL, extractBom } from "./extract.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-region, x-retry-count, x-supabase-client-platform, traceparent, tracestate, baggage",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

type JobRow = {
  id: string;
  project_id: string;
  document_id: string;
  release_id: string | null;
  status: "queued" | "running" | "done" | "failed";
  started_at: string | null;
};

type DocumentRow = {
  id: string;
  project_id: string;
  release_id: string | null;
  storage_path: string;
  mime_type: string | null;
  filename: string;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024; // matches the documents bucket limit
// A `running` job older than this is treated as stale (function crashed or
// timed out) and may be claimed again.
const STALE_RUNNING_MS = 10 * 60 * 1000;

function isClaimable(job: Pick<JobRow, "status" | "started_at">, now: number): boolean {
  if (job.status === "queued" || job.status === "failed") return true;
  if (job.status !== "running") return false;
  const started = job.started_at ? Date.parse(job.started_at) : NaN;
  return Number.isNaN(started) || now - started > STALE_RUNNING_MS;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "function misconfigured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "missing bearer token" }, 401);

  let jobId: string | undefined;
  try {
    const body = (await req.json()) as { job_id?: unknown };
    if (typeof body.job_id === "string" && /^[0-9a-f-]{36}$/i.test(body.job_id)) jobId = body.job_id;
  } catch {
    // fallthrough
  }
  if (!jobId) return json({ error: "body must be { job_id: uuid }" }, 400);

  // User-scoped client: RLS decides whether the caller may see the job.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid token" }, 401);

  const { data: visible, error: visErr } = await userClient
    .from("extraction_jobs")
    .select("id, project_id, document_id, release_id, status, started_at")
    .eq("id", jobId)
    .maybeSingle();
  if (visErr) return json({ error: visErr.message }, 500);
  if (!visible) return json({ error: "job not found" }, 404);
  const job = visible as JobRow;
  const now = Date.now();
  if (!isClaimable(job, now)) {
    return json({ job_id: job.id, status: job.status, error: `job is ${job.status}` }, 409);
  }

  // Service-role client for the state machine and the private bucket.
  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Claim the job (guards against a concurrent second call). The filter
  // mirrors isClaimable: queued/failed, or running but stale.
  let claimQuery = admin
    .from("extraction_jobs")
    .update({ status: "running", started_at: new Date(now).toISOString(), error: null })
    .eq("id", job.id);
  if (job.status === "running") {
    claimQuery = claimQuery.eq("status", "running");
    if (job.started_at) claimQuery = claimQuery.eq("started_at", job.started_at);
    else claimQuery = claimQuery.is("started_at", null);
  } else {
    claimQuery = claimQuery.in("status", ["queued", "failed"]);
  }
  const { data: claimed, error: claimErr } = await claimQuery.select("id").maybeSingle();
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!claimed) return json({ job_id: job.id, status: "running", error: "job already running" }, 409);

  const fail = async (message: string, status = 500) => {
    await admin
      .from("extraction_jobs")
      .update({ status: "failed", error: message.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return json({ job_id: job.id, status: "failed", count: 0, error: message }, status);
  };

  try {
    // The document is read through the USER client so RLS applies, and it must
    // belong to the job's project (and release, when the job names one).
    const { data: doc, error: docErr } = await userClient
      .from("documents")
      .select("id, project_id, release_id, storage_path, mime_type, filename")
      .eq("id", job.document_id)
      .maybeSingle();
    if (docErr) return await fail(docErr.message);
    if (!doc) return await fail("document not found", 404);
    const document = doc as DocumentRow;
    const releaseOk = job.release_id === null || document.release_id === null || document.release_id === job.release_id;
    if (document.project_id !== job.project_id || !releaseOk) {
      return await fail("document not in job project", 403);
    }
    const isPdf = (document.mime_type ?? "").includes("pdf") || /\.pdf$/i.test(document.filename);
    if (!isPdf) return await fail("only PDF documents can be extracted", 422);

    const { data: blob, error: dlErr } = await admin.storage.from("documents").download(document.storage_path);
    if (dlErr || !blob) return await fail(`download failed: ${dlErr?.message ?? "empty"}`);
    if (blob.size > MAX_PDF_BYTES) return await fail("document too large", 422);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const result = await extractBom(
      bytes,
      apiKey ? { apiKey, model: Deno.env.get("ANTHROPIC_MODEL") ?? DEFAULT_MODEL } : null,
    );

    const { error: doneErr } = await admin
      .from("extraction_jobs")
      .update({
        status: "done",
        method: result.method,
        pages: result.pages,
        candidates: result.candidates,
        error: result.llm_error ? `llm pass skipped: ${result.llm_error}`.slice(0, 2000) : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (doneErr) return await fail(doneErr.message);

    return json({
      job_id: job.id,
      status: "done",
      count: result.candidates.length,
      method: result.method,
      pages: result.pages,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("extract-bom failed", job.id, message);
    return await fail(message);
  }
});
