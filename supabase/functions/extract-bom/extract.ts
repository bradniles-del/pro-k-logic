// PDF -> page texts -> BOM candidates (heuristic, optionally refined by an LLM).
// No database access here so it can be exercised locally (see local-test.ts).

import { extractText, getDocumentProxy } from "unpdf";
import { parseBomText, type BomCandidate } from "../_shared/bom-parser.ts";

export type { BomCandidate };

export type ExtractionMethod = "heuristic" | "heuristic+llm";

export type ExtractionResult = {
  pages: number;
  method: ExtractionMethod;
  candidates: BomCandidate[];
  llm_error?: string; // set when the LLM pass was attempted but failed (heuristic result still returned)
};

/** Text per page (index 0 = page 1) using unpdf's serverless pdf.js build. */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t) => t ?? "");
}

export type LlmOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  maxChars?: number; // cap on page text sent to the model
};

export const DEFAULT_MODEL = "claude-sonnet-4-5";

/** Full pipeline: text extraction, heuristics, optional LLM correction and merge. */
export async function extractBom(bytes: Uint8Array, llm?: LlmOptions | null): Promise<ExtractionResult> {
  const pages = await extractPdfPages(bytes);
  const heuristic = parseBomText(pages);
  if (!llm?.apiKey) return { pages: pages.length, method: "heuristic", candidates: heuristic };
  try {
    const refined = await refineWithLlm(pages, heuristic, llm);
    return { pages: pages.length, method: "heuristic+llm", candidates: mergeCandidates(heuristic, refined) };
  } catch (e) {
    return {
      pages: pages.length,
      method: "heuristic",
      candidates: heuristic,
      llm_error: e instanceof Error ? e.message : String(e),
    };
  }
}

// --- LLM pass ---------------------------------------------------------------

const SYSTEM_PROMPT = `You correct bill-of-materials extractions from steel-fabricator shipping release (SRN) documents.
You receive the document text (one block per page) and a heuristic list of candidate line items.
Return the corrected list of line items as a JSON array and NOTHING else: no prose, no markdown fences.
Each element must have exactly these keys:
  line_no (integer or null), piece_mark (string or null), description (string), qty (number or null),
  uom (string or null, upper-case unit such as EA, PCS, FT, M, KG, LB), page (integer, 1-based),
  raw (the source line text), confidence (number 0..1, your own certainty).
Rules: one element per physical line item; exclude headers, totals, subtotals, page numbers, notes and
signature lines; merge wrapped description continuations into the item they belong to; never invent items
that are not in the text; keep qty as a plain number (no units); leave a field null if it is not present.`;

export async function refineWithLlm(pages: string[], heuristic: BomCandidate[], opts: LlmOptions): Promise<BomCandidate[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxChars = opts.maxChars ?? 120_000;
  let text = pages.map((p, i) => `=== PAGE ${i + 1} ===\n${p}`).join("\n\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + "\n[truncated]";

  const user = `DOCUMENT TEXT:\n${text}\n\nHEURISTIC CANDIDATES (JSON):\n${JSON.stringify(heuristic)}\n\nReturn the corrected JSON array now.`;

  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: SYSTEM_PROMPT,
      // No assistant prefill: newer models reject it; parseLlmArray tolerates fences/prose instead.
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const out = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return parseLlmArray(out);
}

/** Tolerant parse of the model output: strips fences, validates and coerces each row. */
export function parseLlmArray(s: string): BomCandidate[] {
  let t = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("LLM output is not a JSON array");
  t = t.slice(start, end + 1);
  const arr = JSON.parse(t) as unknown;
  if (!Array.isArray(arr)) throw new Error("LLM output is not a JSON array");
  const rows: BomCandidate[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const qty = toNum(o.qty);
    const description = typeof o.description === "string" ? o.description.replace(/\s+/g, " ").trim() : "";
    if (!description && !o.piece_mark) continue;
    rows.push({
      line_no: toInt(o.line_no),
      piece_mark: typeof o.piece_mark === "string" && o.piece_mark.trim() ? o.piece_mark.trim() : null,
      description,
      qty,
      uom: typeof o.uom === "string" && o.uom.trim() ? o.uom.trim().toUpperCase() : null,
      page: Math.max(1, toInt(o.page) ?? 1),
      raw: typeof o.raw === "string" ? o.raw.replace(/\s+/g, " ").trim() : "",
      confidence: clamp01(toNum(o.confidence) ?? (qty !== null ? 0.8 : 0.5)),
    });
  }
  return rows;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.trunc(n);
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/**
 * Prefer LLM rows. Heuristic rows the LLM dropped are kept at reduced
 * confidence so a person can still see (and reject) them in the UI.
 */
export function mergeCandidates(heuristic: BomCandidate[], llm: BomCandidate[]): BomCandidate[] {
  if (llm.length === 0) return heuristic;
  const keyOf = (c: BomCandidate) => {
    if (c.line_no !== null) return `n:${c.page}:${c.line_no}`;
    if (c.piece_mark) return `m:${c.page}:${c.piece_mark.toUpperCase()}`;
    return `r:${c.page}:${c.raw.toLowerCase()}`;
  };
  const seen = new Set<string>();
  const marks = new Set<string>();
  for (const c of llm) {
    seen.add(keyOf(c));
    if (c.piece_mark) marks.add(`${c.page}:${c.piece_mark.toUpperCase()}`);
  }
  const out = [...llm];
  for (const h of heuristic) {
    const dup = seen.has(keyOf(h)) || (h.piece_mark !== null && marks.has(`${h.page}:${h.piece_mark.toUpperCase()}`));
    if (dup) continue;
    out.push({ ...h, confidence: clamp01(h.confidence * 0.5) });
  }
  out.sort((a, b) => a.page - b.page || (a.line_no ?? 1e9) - (b.line_no ?? 1e9));
  return out;
}
