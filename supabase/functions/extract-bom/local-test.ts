// Local proof of the text-extraction + parser path (no database, no network
// unless ANTHROPIC_API_KEY is set):
//   deno run -A supabase/functions/extract-bom/local-test.ts [file.pdf ...]
import { candidatesToCsv } from "../_shared/bom-parser.ts";
import { extractBom } from "./extract.ts";

const here = new URL(".", import.meta.url).pathname;
const defaults = ["srn_clean", "srn_messy", "srn_twopage"].map(
  (n) => `${here}../../../packages/shared/test-fixtures/${n}.pdf`,
);
const files = Deno.args.length ? Deno.args : defaults;
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const llm = apiKey ? { apiKey, model: Deno.env.get("ANTHROPIC_MODEL") ?? undefined } : null;

for (const f of files) {
  const bytes = await Deno.readFile(f);
  const t0 = performance.now();
  const r = await extractBom(bytes, llm);
  const ms = Math.round(performance.now() - t0);
  const avg = r.candidates.length ? r.candidates.reduce((a, c) => a + c.confidence, 0) / r.candidates.length : 0;
  console.log(
    `${f.split("/").pop()}: pages=${r.pages} method=${r.method} candidates=${r.candidates.length} ` +
      `avg_confidence=${avg.toFixed(2)} ${ms}ms${r.llm_error ? ` llm_error=${r.llm_error}` : ""}`,
  );
  if (Deno.env.get("VERBOSE")) console.log(candidatesToCsv(r.candidates));
}
