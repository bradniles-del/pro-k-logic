// GENERATED COPY - do not edit. Source: packages/shared/src/bom-parser.ts
// Refresh with: sh packages/shared/scripts/sync-parser.sh
// Heuristic BOM (bill of materials) extractor for SRN / shipping-release text.
//
// Input is the text of a PDF, one string per page (pdftotext -layout, unpdf,
// pdf.js...). Output is a list of CANDIDATE lines with a 0..1 confidence; a
// person confirms them in the UI before they become release_lines
// (provenance = 'extracted'). Nothing here is authoritative.
//
// This file is the source of truth. supabase/functions/_shared/bom-parser.ts
// is a verbatim copy for the Deno edge function; refresh it with
// packages/shared/scripts/sync-parser.sh after editing.
//
// Pure TypeScript, no dependencies, no I/O.

export type BomCandidate = {
  line_no: number | null;
  description: string;
  qty: number | null;
  uom: string | null;
  piece_mark: string | null;
  page: number; // 1-based
  raw: string; // source line(s), whitespace-normalised
  confidence: number; // 0..1
};

/** Units of measure recognised (case-insensitive) as the UOM column. */
export const BOM_UOMS = [
  "EA", "EACH", "PC", "PCS", "PIECE", "PIECES",
  "FT", "LF", "IN", "M", "MM", "CM", "LM",
  "KG", "LB", "LBS", "T", "TON", "TONS", "TONNE", "MT",
  "L", "GAL", "SET", "SETS", "LOT", "PR", "PAIR", "ASSY", "KIT",
  "BDL", "BUNDLE", "SKID", "PALLET", "PLT", "BOX", "CRATE", "ROLL", "COIL",
  "SF", "SQFT", "SQM", "M2", "M3", "CY", "CF",
] as const;
export type BomUom = (typeof BOM_UOMS)[number];

const UOM_SET: ReadonlySet<string> = new Set<string>(BOM_UOMS);

// --- header detection -------------------------------------------------------

type Column = "line_no" | "piece_mark" | "description" | "qty" | "uom" | "other";

// Anchored at the start only: pdftotext -layout sometimes fuses two labels
// ("UOMWeight (kg)"), so a label may be followed by another capitalised word.
// The longest match wins ("Item Description" is a description, not a line no).
const HEADER_WORDS: Array<[RegExp, Column]> = [
  [/^(line|item|itm|no\.?|#|ln|pos|seq)(?![a-z0-9])/i, "line_no"],
  [/^(piece\s*mark|piecemark|mark|tag|pc\s*mark|mark\s*no\.?|part\s*(no\.?|#)|id)(?![a-z0-9])/i, "piece_mark"],
  [/^(item\s*description|description|desc\.?|descr|material)(?![a-z0-9])/i, "description"],
  [/^(qty\.?|quantity|qnty|ship\s*qty|shipped)(?![a-z0-9])/i, "qty"],
  [/^(unit\s*of\s*measure|uom|u\/m|um|units|unit)(?![a-z0-9])/i, "uom"],
];

type Header = {
  order: Column[]; // learned column order
  layout: boolean; // true when the header had 2+-space column gaps (pdftotext -layout style)
  starts: Partial<Record<Column, number>>; // char index where each header label starts
  ends: Partial<Record<Column, number>>; // char index where each header label ends
};

/**
 * A header row is a line whose cells are mostly known column labels and which
 * contains at least a description-ish and a qty-ish label (or three known
 * labels overall). Cells are runs separated by 2+ spaces (layout text); for
 * single-spaced text (pdf.js/unpdf output) the labels are consumed greedily
 * from the left instead. pdftotext sometimes fuses two labels ("UOMWeight
 * (kg)"); the label regexes tolerate a trailing capitalised word.
 */
function detectHeader(line: string): Header | null {
  let cells = splitCells(line);
  let layout = true;
  if (cells.length < 2) {
    cells = greedyHeaderCells(line);
    layout = false;
  }
  if (cells.length < 2) return null;
  const order: Column[] = [];
  const starts: Header["starts"] = {};
  const ends: Header["ends"] = {};
  let known = 0;
  for (const cell of cells) {
    const col = classifyHeaderCell(cell.text);
    if (col !== "other") known++;
    order.push(col);
    if (col !== "other" && starts[col] === undefined) {
      starts[col] = cell.start;
      ends[col] = cell.start + cell.text.length;
    }
  }
  const hasQty = order.includes("qty");
  const hasDesc = order.includes("description");
  if (!layout) {
    // Single-spaced text: every line reaches here, so be strict — mostly labels,
    // with a quantity label present ("12 ID-3 ID TAG SET 4 EA" must not qualify).
    const other = order.length - known;
    return known >= 3 && hasQty && other <= known ? { order, layout, starts, ends } : null;
  }
  if ((hasQty && hasDesc) || known >= 3) return { order, layout, starts, ends };
  return null;
}

/** Split a single-spaced line into label-sized cells by matching known labels left to right. */
function greedyHeaderCells(line: string): Cell[] {
  const cells: Cell[] = [];
  let pos = 0;
  while (pos < line.length) {
    const ws = /^\s+/.exec(line.slice(pos));
    if (ws) pos += ws[0].length;
    if (pos >= line.length) break;
    const rest = line.slice(pos);
    let len = 0;
    for (const [re] of HEADER_WORDS) {
      const m = re.exec(rest);
      if (m && m[0].length > len) len = m[0].length;
    }
    if (len === 0) len = (/^\S+/.exec(rest) ?? [""])[0].length || 1;
    cells.push({ text: rest.slice(0, len), start: pos });
    pos += len;
  }
  return cells;
}

function classifyHeaderCell(text: string): Column {
  let best: Column = "other";
  let bestLen = 0;
  for (const [re, col] of HEADER_WORDS) {
    const m = re.exec(text);
    if (m && m[0].length > bestLen) {
      best = col;
      bestLen = m[0].length;
    }
  }
  // The label must be the whole cell or be followed by a fused capitalised
  // word / parenthesis, not by arbitrary prose ("Item shipped to site").
  if (best !== "other") {
    const rest = text.slice(bestLen);
    if (rest !== "" && !/^[A-Z(]/.test(rest)) return "other";
  }
  return best;
}

// --- line classification ----------------------------------------------------

const SKIP_LINE = [
  /^\s*(page\s+\d+|\d+\s*(\/|of)\s*\d+\s*$)/i, // page 1 of 2, 1 / 2
  /\bpage\s+\d+\s*(of|\/)\s*\d+\s*$/i, // "... Page 1 of 2" at the end of a header line
  /^\s*(sub\s*-?\s*total|grand\s+total|total|totals)\b/i,
  /^\s*(notes?|remarks?|comments?)\s*[:\-]/i,
  /^\s*(received|checked|inspected|approved|prepared|shipped|signed|picked)\s+by\b/i,
  /^\s*(carrier|trailer|driver|truck|seal|bol|b\/l|pro\s*#|waybill)\b/i,
  /^\s*(continued|cont'd|contd)\b/i,
  /^\s*end\s+of\s+(release|report|list|bom|page|document)/i,
  /^\s*(ship\s*to|sold\s*to|bill\s*to|attn|attention|tel|phone|fax|email)\b/i,
  /^\s*[_\-=.\s]{4,}$/, // rules / signature lines
  /^\s*(gross|net|tare)\s+weight/i,
  /^\s*(unit|suite|bay)\s+\d+/i, // "Unit 12, 4th Ave" address lines
];

// Address-ish: a street word within two words of a compass direction
// ("Industrial Rd NE", "SW 4th Avenue"). Directions are matched case-sensitively
// so "w/" in descriptions and lowercase prose do not trip it.
const STREET_WORD = String.raw`(?:road|rd\.?|street|st\.?|avenue|ave\.?|trail|drive|dr\.?|blvd)`;
const DIRECTION = String.raw`(?:NE|NW|SE|SW|N|S|E|W)`;
const GAP = String.raw`[,.]?\s+(?:\S+\s+){0,2}`;
const ADDRESS_LINE = new RegExp(
  String.raw`(?:\b${STREET_WORD}\b${GAP}${DIRECTION}\b)|(?:\b${DIRECTION}\b${GAP}${STREET_WORD}\b)`,
  "i",
);
function isAddressLike(line: string): boolean {
  const m = ADDRESS_LINE.exec(line);
  if (!m) return false;
  // Re-check the direction token in its original case (the regex is /i for the street word).
  const dirRe = new RegExp(String.raw`\b${DIRECTION}\b`);
  return dirRe.test(m[0]);
}

// Lines that end a wrapped description even when they look like prose.
const STOP_CONTINUATION = /^\s*(rev\.?|revision|date|issued)\b/i;

// A leading integer is a line number only up to 999; larger numbers are
// street numbers, drawing numbers or part of the description.
const LINE_NO = /^(\d{1,3})[.)]?$/;
// Piece marks: uppercase letters/digits with - / . separators, at least one
// digit, e.g. B-101, C12, SP-2201-A, 1B7, PL-3, MISC-1, 2B/4.
const PIECE_MARK = /^(?=.*\d)[A-Z0-9]+(?:[-/.][A-Z0-9]+)*$/;
const NUMBER = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^[+-]?\.\d+$/;

const MAX_QTY = 10_000_000;

function parseQty(tok: string): number | null {
  if (!NUMBER.test(tok)) return null;
  const n = Number(tok.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) return null;
  return n;
}

function isUom(tok: string): boolean {
  return UOM_SET.has(tok.toUpperCase().replace(/\.$/, ""));
}

function normaliseUom(tok: string): string {
  const u = tok.toUpperCase().replace(/\.$/, "");
  if (u === "EACH") return "EA";
  if (u === "PC" || u === "PIECE" || u === "PIECES") return "PCS";
  if (u === "LBS") return "LB";
  if (u === "PAIR") return "PR";
  if (u === "BUNDLE") return "BDL";
  if (u === "PALLET") return "PLT";
  return u;
}

type Cell = { text: string; start: number };

/** Split a -layout line into cells on runs of 2+ spaces or tabs, keeping offsets. */
function splitCells(line: string): Cell[] {
  const cells: Cell[] = [];
  const re = /\S(?:[ ]?\S)*/g; // words separated by at most one space
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    cells.push({ text: m[0], start: m.index });
  }
  return cells;
}

type Parsed = {
  line_no: number | null;
  piece_mark: string | null;
  description: string;
  qty: number;
  uom: string | null;
  fields: number; // how many of the 5 fields matched
  qtyEnd: number; // char offset of the end of the qty token (for header alignment)
  markStart: number; // char offset of the piece mark, -1 if none
};

type Tok = { text: string; start: number };

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push({ text: m[0], start: m.index });
  return out;
}

/**
 * Parse one physical line into fields. Order-agnostic: line number = leading
 * small integer; qty = the last number that is followed by a UOM (or, with no
 * UOM anywhere, the last standalone number after some text); piece mark = the
 * token right after the line number, or right before the qty when the header
 * says the mark column follows the description.
 */
function parseLine(line: string, header: Header | null): Parsed | null {
  const toks = tokenize(line);
  if (toks.length < 2) return null;

  let i = 0;
  let line_no: number | null = null;
  const ln = LINE_NO.exec(toks[0].text);
  if (ln) {
    line_no = Number(ln[1]);
    i = 1;
  }

  // Find qty: scan from the end for (number, uom) pairs.
  let qtyIdx = -1;
  let uomIdx = -1;
  for (let k = toks.length - 1; k > i; k--) {
    if (isUom(toks[k].text) && parseQty(toks[k - 1].text) !== null) {
      qtyIdx = k - 1;
      uomIdx = k;
      break;
    }
  }
  if (qtyIdx === -1 && line_no !== null) {
    // No UOM anywhere: accept the last number on the line as the qty, but only
    // on a numbered line with descriptive text before it (keeps "Skids: 2",
    // "Bundles: 3" and address lines out).
    for (let k = toks.length - 1; k > i; k--) {
      if (parseQty(toks[k].text) !== null) {
        const before = toks.slice(i, k);
        if (before.some((t) => /[A-Za-z]{2,}/.test(t.text))) qtyIdx = k;
        break; // only the last number qualifies
      }
    }
  }
  if (qtyIdx === -1) return null;
  const qty = parseQty(toks[qtyIdx].text)!;

  const markAfterDesc =
    header !== null &&
    header.order.includes("piece_mark") &&
    header.order.includes("description") &&
    header.order.indexOf("piece_mark") > header.order.indexOf("description");

  let piece_mark: string | null = null;
  let markStart = -1;
  let descFrom = i;
  let descTo = qtyIdx; // exclusive
  if (markAfterDesc) {
    const cand = toks[qtyIdx - 1];
    if (cand && qtyIdx - 1 >= i && PIECE_MARK.test(cand.text) && cand.text.length <= 20) {
      piece_mark = cand.text;
      markStart = cand.start;
      descTo = qtyIdx - 1;
    }
  } else if (i < qtyIdx) {
    const cand = toks[i];
    // A bare number here (e.g. "4500" that was too large to be a line number)
    // is part of the description, not a mark.
    if (PIECE_MARK.test(cand.text) && !/^\d+$/.test(cand.text) && cand.text.length <= 20 && !isUom(cand.text)) {
      piece_mark = cand.text;
      markStart = cand.start;
      descFrom = i + 1;
    }
  }

  const description = toks
    .slice(descFrom, descTo)
    .map((t) => t.text)
    .join(" ")
    .trim();
  if (!description && !piece_mark) return null;

  const uom = uomIdx === -1 ? null : normaliseUom(toks[uomIdx].text);
  const fields =
    (line_no !== null ? 1 : 0) + (piece_mark ? 1 : 0) + (description ? 1 : 0) + 1 + (uom ? 1 : 0);
  return {
    line_no,
    piece_mark,
    description,
    qty,
    uom,
    fields,
    qtyEnd: toks[qtyIdx].start + toks[qtyIdx].text.length,
    markStart,
  };
}

function scoreConfidence(p: Parsed, header: Header | null, sequential: boolean): number {
  let c = 0;
  if (p.line_no !== null) c += 0.15;
  if (p.piece_mark) c += 0.25;
  if (p.description) c += 0.2;
  c += 0.25; // qty (always present here)
  if (p.uom) c += 0.15;
  if (header && header.layout) {
    // Alignment with the learned header (layout text only): qty right-aligned
    // near the Qty label, or the mark starting at the Mark label.
    const qEnd = header.ends.qty;
    const mStart = header.starts.piece_mark;
    const qtyAligned = qEnd !== undefined && Math.abs(p.qtyEnd - qEnd) <= 4;
    const markAligned = mStart !== undefined && p.markStart >= 0 && Math.abs(p.markStart - mStart) <= 3;
    if (qtyAligned || markAligned) c += 0.1;
    else c -= 0.1;
  }
  if (sequential) c += 0.05;
  return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
}

function normaliseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Extract BOM candidate rows from page texts (index 0 = page 1).
 */
export function parseBomText(pages: string[]): BomCandidate[] {
  const out: BomCandidate[] = [];
  let header: Header | null = null;
  let lastLineNo: number | null = null;

  for (let p = 0; p < pages.length; p++) {
    const pageNo = p + 1;
    const lines = (pages[p] ?? "").replace(/\r\n?/g, "\n").replace(/\f/g, "\n").split("\n");
    let prev: BomCandidate | null = null; // candidate on the immediately preceding line
    let prevParsed: Parsed | null = null;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, "    ").trimEnd();
      if (!line.trim()) {
        prev = null;
        continue;
      }

      const h = detectHeader(line);
      if (h) {
        header = h;
        prev = null;
        continue;
      }
      if (SKIP_LINE.some((re) => re.test(line)) || isAddressLike(line)) {
        prev = null;
        continue;
      }

      const parsed = parseLine(line, header);
      if (parsed) {
        const sequential = lastLineNo !== null && parsed.line_no === lastLineNo + 1;
        const cand: BomCandidate = {
          line_no: parsed.line_no,
          description: normaliseWs(parsed.description),
          qty: parsed.qty,
          uom: parsed.uom,
          piece_mark: parsed.piece_mark,
          page: pageNo,
          raw: normaliseWs(line),
          confidence: scoreConfidence(parsed, header, sequential),
        };
        out.push(cand);
        if (parsed.line_no !== null) lastLineNo = parsed.line_no;
        prev = cand;
        prevParsed = parsed;
        continue;
      }

      // Continuation: no qty/uom, directly under a candidate, not starting with
      // a new line number, not a revision/date/address line, and looking like
      // prose (has letters).
      if (
        prev &&
        prevParsed &&
        !LINE_NO.test(tokenize(line)[0]?.text ?? "") &&
        !STOP_CONTINUATION.test(line) &&
        /[A-Za-z]/.test(line)
      ) {
        const text = normaliseWs(line);
        prev.description = normaliseWs(prev.description + " " + text);
        prev.raw = prev.raw + " \\n " + text;
        continue;
      }
      prev = null;
    }
  }
  return out;
}

// --- CSV --------------------------------------------------------------------

export const BOM_CSV_HEADER = "line_no,piece_mark,description,qty,uom,page,confidence";

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Formula-injection guard: spreadsheet apps evaluate cells starting with
  // = + - @ (numbers are safe; a negative qty never reaches here as text).
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV (CRLF line endings, quoted when needed). */
export function candidatesToCsv(rows: BomCandidate[]): string {
  const lines = [BOM_CSV_HEADER];
  for (const r of rows) {
    lines.push(
      [r.line_no, r.piece_mark, r.description, r.qty, r.uom, r.page, r.confidence].map(csvField).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
