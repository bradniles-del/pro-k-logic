// deno test -A supabase/functions/extract-bom/extract_test.ts (run from this directory)
import { deepStrictEqual as assertEquals } from "node:assert";
import { extractBom, mergeCandidates, parseLlmArray, type BomCandidate } from "./extract.ts";

const fixture = (n: string) => new URL(`../../../packages/shared/test-fixtures/${n}.pdf`, import.meta.url).pathname;

Deno.test("unpdf + parser recovers every fixture row", async () => {
  for (const [name, n] of [["srn_clean", 10], ["srn_messy", 8], ["srn_twopage", 15]] as const) {
    const r = await extractBom(await Deno.readFile(fixture(name)), null);
    assertEquals(r.candidates.length, n, name);
    assertEquals(r.method, "heuristic");
  }
});

Deno.test("parseLlmArray tolerates fences and coerces fields", () => {
  const rows = parseLlmArray('```json\n[{"line_no":"1","piece_mark":"B-1","description":" W12  BEAM ","qty":"4","uom":"ea","page":1,"raw":"x","confidence":0.95},{"description":""}]\n```');
  assertEquals(rows.length, 1);
  assertEquals(rows[0], { line_no: 1, piece_mark: "B-1", description: "W12 BEAM", qty: 4, uom: "EA", page: 1, raw: "x", confidence: 0.95 });
});

Deno.test("mergeCandidates prefers LLM rows and keeps dropped heuristic rows at half confidence", () => {
  const h: BomCandidate[] = [
    { line_no: 1, piece_mark: "B-1", description: "BEAM", qty: 4, uom: "EA", page: 1, raw: "1 B-1 BEAM 4 EA", confidence: 1 },
    { line_no: 2, piece_mark: "B-2", description: "BEAM", qty: 2, uom: "EA", page: 1, raw: "2 B-2 BEAM 2 EA", confidence: 0.8 },
  ];
  const l: BomCandidate[] = [
    { line_no: 1, piece_mark: "B-1", description: "W12x26 BEAM", qty: 4, uom: "EA", page: 1, raw: "1 B-1 W12x26 BEAM 4 EA", confidence: 0.9 },
  ];
  const m = mergeCandidates(h, l);
  assertEquals(m.length, 2);
  assertEquals(m[0].description, "W12x26 BEAM");
  assertEquals(m[1].piece_mark, "B-2");
  assertEquals(m[1].confidence, 0.4);
  assertEquals(mergeCandidates(h, []), h);
});

Deno.test("extractBom falls back to heuristic when the LLM call fails", async () => {
  const r = await extractBom(await Deno.readFile(fixture("srn_clean")), {
    apiKey: "test",
    fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
  });
  assertEquals(r.method, "heuristic");
  assertEquals(r.candidates.length, 10);
  assertEquals(r.llm_error?.startsWith("anthropic 500"), true);
});

Deno.test("extractBom uses the LLM rows when the call succeeds", async () => {
  const r = await extractBom(await Deno.readFile(fixture("srn_clean")), {
    apiKey: "test",
    fetchImpl: (_url, init) => {
      const req = JSON.parse(String(init?.body));
      assertEquals(req.model, "claude-sonnet-4-5");
      const reply = { content: [{ type: "text", text: JSON.stringify([{ line_no: 1, piece_mark: "B-101", description: "LLM BEAM", qty: 4, uom: "EA", page: 1, raw: "r", confidence: 0.97 }]) }] };
      return Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }));
    },
  });
  assertEquals(r.method, "heuristic+llm");
  assertEquals(r.candidates.length, 10);
  assertEquals(r.candidates[0].description, "LLM BEAM");
  assertEquals(r.candidates[1].confidence, 0.5); // heuristic row the LLM dropped
});
