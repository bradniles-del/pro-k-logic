# Edge functions

Deno edge functions for the live project `lvllwbqqvshruramhnrj` (ca-central-1).

| Function      | Purpose                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `extract-bom`  | Turns an SRN PDF (`documents` bucket) into candidate BOM lines on an `extraction_jobs` row. |
| `render-label` | Builds QR label / paperwork PDFs into the private `labels` bucket (see its `index.ts`).    |

`_shared/bom-parser.ts` is a generated copy of `packages/shared/src/bom-parser.ts` (the source of truth,
tested with `npm test -w @prok/shared`). After editing the parser run `sh packages/shared/scripts/sync-parser.sh`.

## extract-bom

Request: `POST /functions/v1/extract-bom` with the caller's JWT and body `{ "job_id": "<uuid>" }`.
The job must be `queued` or `failed` and visible to the caller (RLS: project member). The function sets
the job to `running`, downloads `documents.storage_path`, extracts text per page with
[`unpdf`](https://www.npmjs.com/package/unpdf) (pdf.js serverless build), runs the heuristic parser and,
when `ANTHROPIC_API_KEY` is set, asks Claude to correct the candidates (only the extracted text is sent,
never the file). It then writes `candidates`, `pages`, `method` (`heuristic` or `heuristic+llm`),
`status = done`, `finished_at`; on error `status = failed` + `error`.

Response: `{ job_id, status, count, method, pages }` or `{ job_id, status: "failed", count: 0, error }`.

### Invoking from a client

Always pass `x-region: ca-central-1` so the request is served in-region (data residency; the project's
storage and database are in ca-central-1 and the function must not run elsewhere):

```ts
const { data, error } = await supabase.functions.invoke("extract-bom", {
  body: { job_id },
  headers: { "x-region": "ca-central-1" },
});
```

CORS is handled in the function (OPTIONS preflight + `Access-Control-Allow-*` headers), so browsers can
call it directly.

### Deploy

```bash
supabase login
supabase functions deploy extract-bom --project-ref lvllwbqqvshruramhnrj
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
The LLM pass is optional; enable it with:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref lvllwbqqvshruramhnrj
# optional, defaults to claude-sonnet-4-5
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-4-5 --project-ref lvllwbqqvshruramhnrj
```

Without the key the function runs heuristics only (`method = 'heuristic'`). If the key is set but the
API call fails, the heuristic result is still saved and the job's `error` column notes the skipped pass.

### Local checks (no database needed)

Run these from the function directory so Deno picks up its `deno.json` (from the repo root it finds the
npm workspace `package.json` first):

```bash
cd supabase/functions/extract-bom
deno check index.ts
deno test -A extract_test.ts          # unpdf + parser on the fixture PDFs, LLM merge logic
deno run -A local-test.ts             # prints candidate counts for the three fixture PDFs
ANTHROPIC_API_KEY=... deno run -A local-test.ts   # same, with the LLM pass
```

Fixture PDFs live in `packages/shared/test-fixtures/` (`python3 make_fixtures.py` regenerates them).
