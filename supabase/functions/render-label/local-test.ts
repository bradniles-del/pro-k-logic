// Local proof for the label renderer. No database, no network beyond npm.
//
//   deno run -A supabase/functions/render-label/local-test.ts [out-dir]
//
// Writes thermal.pdf (3 units), letter-grid.pdf (7 units on one sheet) and
// paperwork.pdf (one SRN block) and prints the URL each QR encodes so a
// decoder can be checked against it.

import { LabelRelease, LabelUnit, renderPaperworkBlock, renderUnitLabels, scanUrl } from "../_shared/label-pdf.ts";

const outDir = Deno.args[0] ??
  "/tmp/claude-0/-home-claude/9056921d-ae70-58ce-b4d3-444b62357766/scratchpad/labels";
await Deno.mkdir(outDir, { recursive: true });

const baseUrl = Deno.env.get("WEB_BASE_URL") ?? "https://app.pro-k-logic.com";

// 16 random bytes, base64url, like public.random_token(16)
function fakeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const kinds = ["crate", "bundle", "skid", "spool", "piece", "module", "other"];
const descriptions = [
  "Structural steel W12x26 beams, grid lines 4-7, level 2",
  "HSS 6x6x3/8 columns C-14 to C-19 with base plates and anchor bolt templates, primed, plus loose clip angles bagged and tagged per piece mark",
  "Pipe spool PS-2201-A 8\" sch 40 CS",
  "Electrical cable tray 12\" ladder type, 10 ft sections (qty 24) with splice plates",
  "Insulation, mineral wool 2\" x 24\" x 48\" boards",
  "Grating panels 1\"x3/16\" serrated, 3 ft x 20 ft",
  "Misc. hardware: A325 bolt kits, washers, DTIs — Sûreté d'étiquetage",
];

function fakeUnits(n: number, total: number): LabelUnit[] {
  return Array.from({ length: n }, (_, i) => ({
    token: fakeToken(),
    short_code: `PKL-${["2H7K", "9XQ3", "AB4D", "MN8P", "C6RT", "W3ZY", "5GHJ"][i % 7]}-${["Q7C8", "M2NX", "T9V4", "H5EK", "P8D3", "B2FJ", "R6WS"][i % 7]}`,
    description: descriptions[i % descriptions.length],
    kind: kinds[i % kinds.length],
    index: i + 1,
    total,
    srn_number: "SRN-2026-000142",
    po_number: i % 3 === 2 ? null : "PO-KFC-2026-0871",
    project_code: "KFC-WEST-2",
    weight_kg: i % 2 === 0 ? 1240.5 : null,
  }));
}

const thermalUnits = fakeUnits(3, 12);
const gridUnits = fakeUnits(7, 7);
const release: LabelRelease = {
  token: fakeToken(),
  srn_number: "SRN-2026-000142",
  po_number: "PO-KFC-2026-0871",
  project_code: "KFC-WEST-2",
  supplier_name: "Steelco Fabrication Ltd. (Nisku yard)",
  line_count: 38,
};

const thermal = await renderUnitLabels(thermalUnits, { format: "thermal-4x6", baseUrl });
const grid = await renderUnitLabels(gridUnits, { format: "letter-grid", baseUrl });
const block = await renderPaperworkBlock(release, { baseUrl });

await Deno.writeFile(`${outDir}/thermal.pdf`, thermal);
await Deno.writeFile(`${outDir}/letter-grid.pdf`, grid);
await Deno.writeFile(`${outDir}/paperwork.pdf`, block);

const expected = {
  "thermal.pdf": scanUrl(baseUrl, thermalUnits[0].token),
  "letter-grid.pdf": scanUrl(baseUrl, gridUnits[0].token),
  "paperwork.pdf": scanUrl(baseUrl, release.token),
};
await Deno.writeTextFile(`${outDir}/expected.json`, JSON.stringify(expected, null, 2));

console.log(`thermal.pdf      ${thermal.length} bytes, ${thermalUnits.length} pages`);
console.log(`letter-grid.pdf  ${grid.length} bytes, 1 page (${gridUnits.length} labels)`);
console.log(`paperwork.pdf    ${block.length} bytes, 1 page`);
console.log("first-page QR payloads written to expected.json");
