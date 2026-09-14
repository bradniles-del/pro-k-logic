// node --experimental-strip-types --test src/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BOM_UOMS, candidatesToCsv, parseBomText, type BomCandidate } from "./bom-parser.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures");

type Expected = { line_no: number; piece_mark: string; qty: number; uom: string };

/** pdftotext -layout separates pages with form feeds. */
function loadFixture(name: string): { pages: string[]; expected: Expected[] } {
  const text = readFileSync(join(FIXTURES, `${name}.txt`), "utf8");
  const pages = text.split("\f").filter((p) => p.trim().length > 0);
  const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), "utf8")) as Expected[];
  return { pages, expected };
}

/** Fraction of expected rows recovered with matching line_no, piece_mark, qty and uom. */
function recovered(cands: BomCandidate[], expected: Expected[]): { hits: Expected[]; misses: Expected[] } {
  const hits: Expected[] = [];
  const misses: Expected[] = [];
  for (const e of expected) {
    const hit = cands.find(
      (c) => c.line_no === e.line_no && c.piece_mark === e.piece_mark && c.qty === e.qty && c.uom === e.uom,
    );
    (hit ? hits : misses).push(e);
  }
  return { hits, misses };
}

test("clean SRN: recovers at least 90% of rows with all fields", () => {
  const { pages, expected } = loadFixture("srn_clean");
  assert.equal(pages.length, 1);
  const cands = parseBomText(pages);
  const { hits, misses } = recovered(cands, expected);
  assert.ok(hits.length / expected.length >= 0.9, `recovered ${hits.length}/${expected.length}; missed ${JSON.stringify(misses)}`);
  // No junk rows: the header/footer/weight column must not produce candidates.
  assert.equal(cands.length, expected.length, JSON.stringify(cands, null, 1));
  // Header row present => alignment bonus; every row has all five fields.
  for (const c of cands) {
    assert.ok(c.confidence >= 0.9, `${c.raw} -> ${c.confidence}`);
    assert.equal(c.page, 1);
  }
  const b101 = cands.find((c) => c.piece_mark === "B-101")!;
  assert.equal(b101.description, `W12x26 BEAM, 24'-6" LG, A992`);
  assert.equal(b101.qty, 4);
  assert.equal(b101.uom, "EA");
  const gr4 = cands.find((c) => c.piece_mark === "GR-4")!;
  assert.equal(gr4.qty, 45.5);
  assert.equal(gr4.uom, "FT");
});

test("messy SRN: wrapped descriptions merge, totals row excluded", () => {
  const { pages, expected } = loadFixture("srn_messy");
  const cands = parseBomText(pages);
  const { hits, misses } = recovered(cands, expected);
  assert.equal(misses.length, 0, `missed ${JSON.stringify(misses)}`);
  assert.equal(cands.length, expected.length, JSON.stringify(cands, null, 1));
  assert.ok(hits.length === expected.length);

  // TOTAL row (354.75, "8 LINES") and the subtotal-weight line are not candidates.
  assert.ok(!cands.some((c) => c.qty === 354.75), "totals row leaked");
  assert.ok(!cands.some((c) => /total/i.test(c.raw)), "a total line leaked");
  assert.ok(!cands.some((c) => /skids|bundles/i.test(c.description)), "footer leaked");

  // Continuation lines appended to the preceding candidate's description.
  const b201 = cands.find((c) => c.piece_mark === "B-201")!;
  assert.equal(b201.description, `W16x36 BEAM 28'-4" LG A992 W/ SHEAR TABS BOTH ENDS, PRIMED GREY`);
  const c7 = cands.find((c) => c.piece_mark === "C-7")!;
  assert.equal(c7.description, `HSS8x8x1/2 COLUMN 22'-0" W/ CAP PL 3/4" x 12" x 12" AND BASE PL 1" x 16" x 16"`);
  const misc = cands.find((c) => c.piece_mark === "MISC-1")!;
  assert.equal(misc.description, `LOOSE BOLTS A325 3/4" x 2-1/2" W/ NUTS AND WASHERS`);
  assert.equal(misc.qty, 240);
  // Trailing drawing column ignored, decimals parsed.
  assert.equal(cands.find((c) => c.piece_mark === "GR-11")!.qty, 62.25);
  assert.equal(cands.find((c) => c.piece_mark === "WELD-1")!.uom, "KG");
});

test("two-page SRN: all rows recovered with correct page numbers, repeated header ignored", () => {
  const { pages, expected } = loadFixture("srn_twopage");
  assert.equal(pages.length, 2);
  const cands = parseBomText(pages);
  const { misses } = recovered(cands, expected);
  assert.equal(misses.length, 0, `missed ${JSON.stringify(misses)}`);
  assert.equal(cands.length, expected.length, JSON.stringify(cands, null, 1));
  for (const c of cands) {
    assert.equal(c.page, c.line_no! <= 8 ? 1 : 2);
  }
  assert.ok(!cands.some((c) => /PO Line/i.test(c.description)), "wrapped header label leaked");
  assert.ok(!cands.some((c) => /continued|END OF RELEASE/i.test(c.raw)));
  // "L" (litres) recognised as a UOM; trailing PO-line number not taken as qty.
  const paint = cands.find((c) => c.piece_mark === "MISC-2")!;
  assert.equal(paint.qty, 4);
  assert.equal(paint.uom, "L");
  const hr3 = cands.find((c) => c.piece_mark === "HR-3")!;
  assert.equal(hr3.qty, 240.5);
});

test("per-line heuristics without a header row", () => {
  const cands = parseBomText([
    [
      "Some preamble text for the shipment",
      "1 B-101 W12x26 BEAM 24'-6\" LG 4 ea",
      "2 C12 HSS6x6x3/8 COLUMN 6 EACH",
      "3 SP-2201-A STAIR STRINGER 1 Pcs",
      "4 1B7 L3x3x1/4 BRACE ANGLE 1,200 lbs",
      "5 PL-3 BASE PLATE 8",
      "6 GALV WASHERS 3/4\" 48 EA", // no piece mark (GALV has no digit)
      "Page 1 of 1",
    ].join("\n"),
  ]);
  assert.equal(cands.length, 6);
  assert.deepEqual(
    cands.map((c) => [c.line_no, c.piece_mark, c.qty, c.uom]),
    [
      [1, "B-101", 4, "EA"],
      [2, "C12", 6, "EA"],
      [3, "SP-2201-A", 1, "PCS"],
      [4, "1B7", 1200, "LB"],
      [5, "PL-3", 8, null],
      [6, null, 48, "EA"],
    ],
  );
  assert.equal(cands[5].description, `GALV WASHERS 3/4"`);
  // Fewer fields => lower confidence; the no-UOM row sits below the full ones.
  assert.ok(cands[4].confidence < cands[3].confidence);
  assert.ok(cands[5].confidence < cands[0].confidence);
  for (const c of cands) assert.ok(c.confidence > 0 && c.confidence <= 1);
});

test("mark column after description (learned from header)", () => {
  const cands = parseBomText([
    [
      "Item   Description                 Mark      Qty   UOM",
      "1      W12x26 BEAM 24'-6\" LG       B-101     4     EA",
      "2      HSS6x6x3/8 COLUMN           C12       6     EA",
    ].join("\n"),
  ]);
  assert.equal(cands.length, 2);
  assert.equal(cands[0].piece_mark, "B-101");
  assert.equal(cands[0].description, `W12x26 BEAM 24'-6" LG`);
  assert.equal(cands[1].piece_mark, "C12");
});

test("qty must be parseable; lines without one are dropped or merged", () => {
  const cands = parseBomText(["1 B-1 BEAM abc EA\n2 B-2 BEAM 3 EA\n   extra wording here\n\n3 B-3 GIRT 99999999999 EA"]);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].piece_mark, "B-2");
  assert.equal(cands[0].description, "BEAM extra wording here");
});

test("UOM list exported and normalised", () => {
  assert.ok(BOM_UOMS.includes("EA"));
  assert.ok(BOM_UOMS.includes("KG"));
  assert.ok(BOM_UOMS.includes("M"));
  assert.ok(BOM_UOMS.length > 20);
});

test("candidatesToCsv: RFC 4180 quoting", () => {
  const rows: BomCandidate[] = [
    { line_no: 1, piece_mark: "B-1", description: `PL 1/2" x 12", "A36"`, qty: 2.5, uom: "EA", page: 1, raw: "x", confidence: 0.9 },
    { line_no: null, piece_mark: null, description: "line1\nline2", qty: 3, uom: null, page: 2, raw: "y", confidence: 0.4 },
  ];
  const csv = candidatesToCsv(rows);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "line_no,piece_mark,description,qty,uom,page,confidence");
  assert.equal(lines[1], `1,B-1,"PL 1/2"" x 12"", ""A36""",2.5,EA,1,0.9`);
  assert.equal(lines[2], `,,"line1\nline2",3,,2,0.4`);
  assert.equal(lines[3], "");
  assert.ok(csv.endsWith("\r\n"));
});
