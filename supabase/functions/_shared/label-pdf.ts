// Label PDF rendering with pdf-lib. Everything is vector: QR modules are
// filled rectangles, text uses the built-in Helvetica / Courier-Bold, so a
// label PDF is a few KB and prints crisp on 203/300 dpi thermal printers.
//
// Formats
//   thermal-4x6   one 4 x 6 in page per handling unit (also fits A6 media)
//   letter-grid   US-Letter, 2 x 5 grid of 4 x 2 in labels (Avery 5163 geometry)
//   paperwork     100 x 60 mm block for the SRN itself, to stick on the
//                 front page of the shipping paperwork

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "npm:pdf-lib@1.17.1";
import { qrMatrix } from "./qr.ts";

export type LabelFormat = "thermal-4x6" | "letter-grid";

export interface LabelUnit {
  token: string;
  short_code: string;
  description: string;
  kind: string;
  index: number; // 1-based position within the release
  total: number;
  srn_number: string;
  po_number: string | null;
  project_code: string | null;
  weight_kg?: number | null;
}

export interface LabelRelease {
  token: string;
  srn_number: string;
  po_number: string | null;
  project_code: string | null;
  supplier_name: string;
  line_count: number;
}

export interface RenderOptions {
  format?: LabelFormat;
  /** Web origin; the QR encodes `${baseUrl}/s/${token}`. */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Geometry helpers (PDF user space: 1 pt = 1/72 in, origin bottom-left)
// ---------------------------------------------------------------------------

const IN = 72;
const MM = 72 / 25.4;
const QUIET_MODULES = 4; // minimum quiet zone required by the QR spec

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);

export function scanUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${encodeURIComponent(token)}`;
}

/** Replace characters the standard (WinAnsi) fonts cannot encode. */
function sanitize(text: string): string {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, "?");
}

/** Truncate `text` with an ellipsis so it fits in `maxWidth` at `size`. */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const t = sanitize(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  const ell = "…";
  let lo = 0;
  let hi = t.length;
  // binary search the longest prefix that fits with the ellipsis appended
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(t.slice(0, mid).trimEnd() + ell, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return t.slice(0, lo).trimEnd() + ell;
}

/** Greedy word wrap into at most `maxLines` lines; the last line is ellipsised. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = sanitize(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // out of lines: ellipsise everything that is left onto this last one
      const rest = [current, ...words.slice(i)].filter(Boolean).join(" ");
      return [...lines, fitText(rest, font, size, maxWidth)];
    }
    if (current) lines.push(current);
    current = fitText(words[i], font, size, maxWidth); // a single over-long word
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Largest font size <= `max` (>= `min`) at which `text` fits `maxWidth`. */
function shrinkToFit(text: string, font: PDFFont, max: number, min: number, maxWidth: number): number {
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

/**
 * Draw a QR code whose *outer* square (quiet zone included) is `size` pt with
 * its bottom-left corner at (x, y). Dark modules are drawn as horizontal-run
 * rectangles; the quiet zone is simply left blank (the label stock is white).
 */
function drawQr(page: PDFPage, matrix: boolean[][], x: number, y: number, size: number) {
  const n = matrix.length;
  const module = size / (n + 2 * QUIET_MODULES);
  const ox = x + QUIET_MODULES * module;
  const oy = y + size - QUIET_MODULES * module; // top edge of the symbol
  for (let r = 0; r < n; r++) {
    const row = matrix[r];
    let c = 0;
    while (c < n) {
      if (!row[c]) {
        c++;
        continue;
      }
      let end = c;
      while (end < n && row[end]) end++;
      page.drawRectangle({
        x: ox + c * module,
        y: oy - (r + 1) * module,
        width: (end - c) * module,
        height: module,
        color: BLACK,
      });
      c = end;
    }
  }
}

interface Fonts {
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
}

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const [sans, sansBold, mono] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.CourierBold),
  ]);
  return { sans, sansBold, mono };
}

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color: BLACK });
}

function drawRight(page: PDFPage, text: string, font: PDFFont, size: number, rightX: number, y: number, color = BLACK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

/** "LABEL  value" where the label is small bold and the value is regular. */
function drawField(
  page: PDFPage,
  f: Fonts,
  label: string,
  value: string | null | undefined,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
) {
  const labelSize = size * 0.72;
  // fixed column (widest label we ever print) so values line up
  const labelWidth = f.sansBold.widthOfTextAtSize("PROJECT", labelSize) + labelSize * 0.9;
  page.drawText(label, { x, y: y + (size - labelSize) * 0.35, size: labelSize, font: f.sansBold, color: GREY });
  const v = value && value.trim() ? value : "—";
  page.drawText(fitText(v, f.sans, size, maxWidth - labelWidth), { x: x + labelWidth, y, size, font: f.sans, color: BLACK });
}

function unitCountText(u: LabelUnit): string {
  return `${u.index} of ${u.total}`;
}

function kindText(u: LabelUnit): string {
  return sanitize(u.kind || "unit").toUpperCase();
}

// ---------------------------------------------------------------------------
// thermal-4x6: one unit per page
// ---------------------------------------------------------------------------

const THERMAL_W = 4 * IN;
const THERMAL_H = 6 * IN;

function drawThermalLabel(page: PDFPage, f: Fonts, u: LabelUnit, baseUrl: string) {
  const W = THERMAL_W;
  const H = THERMAL_H;
  const margin = 16;
  const innerW = W - 2 * margin;

  // Header row: kind on the left, count on the right
  const headerY = H - margin - 12;
  page.drawText(fitText(kindText(u), f.sansBold, 12, innerW / 2), { x: margin, y: headerY, size: 12, font: f.sansBold, color: BLACK });
  drawRight(page, `UNIT ${unitCountText(u)}`, f.sansBold, 12, W - margin, headerY);
  page.drawLine({ start: { x: margin, y: headerY - 6 }, end: { x: W - margin, y: headerY - 6 }, thickness: 0.75, color: BLACK });

  // QR: outer square 200 pt (~70 mm) incl. quiet zone, centred
  const qrSize = 200;
  const qrX = (W - qrSize) / 2;
  const qrTop = headerY - 14;
  const qrY = qrTop - qrSize;
  drawQr(page, qrMatrix(scanUrl(baseUrl, u.token), "H"), qrX, qrY, qrSize);

  // Short code: big monospace, centred under the QR
  const codeSize = shrinkToFit(u.short_code, f.mono, 30, 18, innerW);
  const codeY = qrY - 2 - codeSize * 0.75;
  drawCentered(page, sanitize(u.short_code), f.mono, codeSize, W / 2, codeY);

  // Description (up to 2 lines)
  const descSize = 11.5;
  const descLines = wrapText(u.description || "(no description)", f.sans, descSize, innerW, 2);
  let y = codeY - 22;
  for (const line of descLines) {
    page.drawText(line, { x: margin, y, size: descSize, font: f.sans, color: BLACK });
    y -= descSize * 1.25;
  }

  // Fields
  y -= 4;
  const fieldSize = 11;
  const fieldGap = 15;
  drawField(page, f, "SRN", u.srn_number, margin, y, fieldSize, innerW);
  y -= fieldGap;
  drawField(page, f, "PO", u.po_number, margin, y, fieldSize, innerW);
  y -= fieldGap;
  drawField(page, f, "PROJECT", u.project_code, margin, y, fieldSize, innerW);
  if (u.weight_kg != null && Number.isFinite(Number(u.weight_kg))) {
    y -= fieldGap;
    drawField(page, f, "WEIGHT", `${Number(u.weight_kg).toLocaleString("en-CA", { maximumFractionDigits: 1 })} kg`, margin, y, fieldSize, innerW);
  }

  // Footer: big count (for tallying pieces at the gate) + scan hint
  const footY = margin + 8;
  page.drawLine({ start: { x: margin, y: footY + 26 }, end: { x: W - margin, y: footY + 26 }, thickness: 0.75, color: BLACK });
  page.drawText(unitCountText(u), { x: margin, y: footY + 2, size: 18, font: f.sansBold, color: BLACK });
  drawRight(page, "Scan with any phone camera", f.sans, 8, W - margin, footY + 10, GREY);
  drawRight(page, "Pro-K-Logic", f.sansBold, 7, W - margin, footY, GREY);
}

// ---------------------------------------------------------------------------
// letter-grid: 2 x 5 labels of 4 x 2 in on US-Letter (Avery 5163 geometry)
// ---------------------------------------------------------------------------

const LETTER_W = 8.5 * IN;
const LETTER_H = 11 * IN;
const GRID_COLS = 2;
const GRID_ROWS = 5;
const CELL_W = 4 * IN;
const CELL_H = 2 * IN;
const GRID_LEFT = 0.15625 * IN;
const GRID_HGAP = 0.1875 * IN;
const GRID_TOP = 0.5 * IN;

function drawGridCell(page: PDFPage, f: Fonts, u: LabelUnit, baseUrl: string, cellX: number, cellTop: number) {
  const pad = 8;
  const qrSize = CELL_H - 2 * pad; // 128 pt (~45 mm) incl. quiet zone
  drawQr(page, qrMatrix(scanUrl(baseUrl, u.token), "H"), cellX + pad, cellTop - pad - qrSize, qrSize);

  const textX = cellX + pad + qrSize + 2;
  const textW = cellX + CELL_W - pad - textX;

  const codeSize = shrinkToFit(u.short_code, f.mono, 15.5, 10, textW);
  let y = cellTop - pad - codeSize;
  page.drawText(sanitize(u.short_code), { x: textX, y, size: codeSize, font: f.mono, color: BLACK });

  y -= 14;
  page.drawText(fitText(`${unitCountText(u)}  ·  ${kindText(u)}`, f.sansBold, 9, textW), { x: textX, y, size: 9, font: f.sansBold, color: BLACK });

  const descSize = 8;
  y -= 13;
  for (const line of wrapText(u.description || "(no description)", f.sans, descSize, textW, 2)) {
    page.drawText(line, { x: textX, y, size: descSize, font: f.sans, color: BLACK });
    y -= descSize * 1.25;
  }

  y -= 3;
  const fieldSize = 7.5;
  drawField(page, f, "SRN", u.srn_number, textX, y, fieldSize, textW);
  y -= 10.5;
  drawField(page, f, "PO", u.po_number, textX, y, fieldSize, textW);
  y -= 10.5;
  drawField(page, f, "PROJECT", u.project_code, textX, y, fieldSize, textW);

  page.drawText("Scan with any phone camera", { x: textX, y: cellTop - CELL_H + pad + 1, size: 6, font: f.sans, color: GREY });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderUnitLabels(units: LabelUnit[], opts: RenderOptions): Promise<Uint8Array> {
  if (units.length === 0) throw new Error("renderUnitLabels: no units");
  const format = opts.format ?? "thermal-4x6";
  const doc = await PDFDocument.create();
  doc.setTitle(`Pro-K-Logic unit labels (${units.length})`);
  doc.setProducer("Pro-K-Logic render-label");
  const f = await loadFonts(doc);

  if (format === "thermal-4x6") {
    for (const u of units) {
      const page = doc.addPage([THERMAL_W, THERMAL_H]);
      drawThermalLabel(page, f, u, opts.baseUrl);
    }
  } else if (format === "letter-grid") {
    const perPage = GRID_COLS * GRID_ROWS;
    for (let i = 0; i < units.length; i += perPage) {
      const page = doc.addPage([LETTER_W, LETTER_H]);
      units.slice(i, i + perPage).forEach((u, k) => {
        const col = k % GRID_COLS;
        const row = Math.floor(k / GRID_COLS);
        const cellX = GRID_LEFT + col * (CELL_W + GRID_HGAP);
        const cellTop = LETTER_H - GRID_TOP - row * CELL_H;
        drawGridCell(page, f, u, opts.baseUrl, cellX, cellTop);
      });
    }
  } else {
    throw new Error(`unknown label format: ${format}`);
  }
  return await doc.save();
}

const BLOCK_W = 100 * MM;
const BLOCK_H = 60 * MM;

/**
 * One small page (100 x 60 mm) with a ~40 mm QR for the release itself plus
 * the SRN number in monospace, meant to be stuck on the shipping paperwork.
 */
export async function renderPaperworkBlock(release: LabelRelease, opts: RenderOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Pro-K-Logic paperwork block ${release.srn_number}`);
  doc.setProducer("Pro-K-Logic render-label");
  const f = await loadFonts(doc);
  const page = doc.addPage([BLOCK_W, BLOCK_H]);

  const pad = 5 * MM;
  page.drawRectangle({ x: 1, y: 1, width: BLOCK_W - 2, height: BLOCK_H - 2, borderColor: GREY, borderWidth: 0.5, borderDashArray: [3, 2] });

  const qrSize = 44 * MM; // ~40 mm symbol + quiet zone
  const qrX = pad;
  const qrTop = BLOCK_H - pad;
  drawQr(page, qrMatrix(scanUrl(opts.baseUrl, release.token), "H"), qrX, qrTop - qrSize, qrSize);

  const textX = qrX + qrSize + 3 * MM;
  const textW = BLOCK_W - pad - textX;

  let y = qrTop - 10;
  page.drawText("SHIPPING RELEASE", { x: textX, y, size: 9, font: f.sansBold, color: GREY });

  const srn = sanitize(release.srn_number);
  const srnSize = shrinkToFit(srn, f.mono, 15, 8, textW);
  y -= srnSize + 6;
  page.drawText(srn, { x: textX, y, size: srnSize, font: f.mono, color: BLACK });

  const fieldSize = 8.5;
  y -= 16;
  drawField(page, f, "PO", release.po_number, textX, y, fieldSize, textW);
  y -= 12;
  drawField(page, f, "PROJECT", release.project_code, textX, y, fieldSize, textW);
  y -= 12;
  drawField(page, f, "FROM", release.supplier_name, textX, y, fieldSize, textW);
  y -= 12;
  drawField(page, f, "LINES", String(release.line_count), textX, y, fieldSize, textW);

  page.drawText("Scan with any phone camera", { x: qrX + 2, y: pad + 1, size: 6.5, font: f.sans, color: GREY });
  drawRight(page, "Pro-K-Logic", f.sansBold, 6.5, BLOCK_W - pad, pad + 1, GREY);

  return await doc.save();
}
