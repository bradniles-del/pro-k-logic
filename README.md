# Pro-K-Logic

Pro-K-Logic is a procurement and logistics tracking application for construction projects: every shipment and handling unit carries a QR label and a paint-markable short code, and each scan appends a custody event (released, picked up, in transit, delivered, received, stored, issued, installed...) to an append-only passport. Drivers update status manually or, only while a trip they accepted is active, by phone location; the receiving site is warned by approach rings. The project is the sharing boundary: a contractor, its suppliers and its carriers all see one project, and nobody else does. Design, privacy and scope decisions live in the Claude project docs `Pro-K-Logic-Architecture-Plan.md` (sections 7-9 for stack and build order), `Pro-K-Logic-Privacy-Legal-Brief.md`, `decisions.md` and `plan-review-2026-09-12.md`.

## Layout

```
apps/
  mobile/        Expo SDK 57 app (drivers and handlers): expo-router, expo-camera QR scan, expo-location
  web/           Vite + React dashboard and consignee scan landing page (/s/:token)
packages/
  shared/        @prok/shared: enum constants, generated Supabase types, createProkClient()
supabase/
  migrations/    Phase 0 schema (enums, core/custody/privacy tables, RPCs, RLS, hardening)
  tests/         pgTAP RLS isolation tests + run_remote.py
  config.toml    Supabase CLI config for local stack / CI
.github/workflows/ci.yml   typecheck + informational DB tests
```

Root `package.json` uses npm workspaces; `apps/*` and `packages/*` depend on each other by name (`@prok/shared`).

## Prerequisites

- Node 22 (`.nvmrc`) and npm 10+
- For the mobile app: Expo tooling (`npx expo`), EAS CLI (`npm i -g eas-cli`) for builds, Xcode / Android Studio for simulators. The app uses native modules (camera, location, SQLite, secure store), so run it in a **development build**, not Expo Go.
- For the database: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and Docker (local stack only)

## Setup

```bash
npm install            # installs every workspace
npm run typecheck      # tsc in shared, web and mobile
```

## Running each app

**Web dashboard**

```bash
cp apps/web/.env.example apps/web/.env
npm run dev -w @prok/web         # http://localhost:5173
```

Routes: `/sign-in` (email one-time code), `/` (your projects), `/s/:token` (consignee scan landing page, calls `resolve_token`).

**Mobile app**

```bash
cp apps/mobile/.env.example apps/mobile/.env
npm run start -w @prok/mobile    # Metro; press i / a for a simulator with a dev build installed
```

Build a development client with `eas build --profile development --platform ios|android` (profiles in `apps/mobile/eas.json`). Screens: sign-in (email OTP), projects list, scan placeholder. Android deliberately requests foreground location only (`ACCESS_BACKGROUND_LOCATION` is not declared): tracking runs inside a foreground service while a trip is active, per the plan.

**Shared package**

`packages/shared/src/database.types.ts` is generated from the live schema. Regenerate after any migration with `supabase gen types typescript --project-id lvllwbqqvshruramhnrj > packages/shared/src/database.types.ts` (or the Supabase MCP `generate_typescript_types` tool) and keep the enum arrays in `src/index.ts` in sync with `supabase/migrations/20260913000100_extensions_and_enums.sql`.

## Environment variables

All values below are public (the Supabase publishable key is designed to ship in clients; RLS does the protecting). Never put a service-role key in either app.

| App    | Variable                   | Value                                          |
| ------ | -------------------------- | ---------------------------------------------- |
| web    | `VITE_SUPABASE_URL`        | `https://lvllwbqqvshruramhnrj.supabase.co`     |
| web    | `VITE_SUPABASE_KEY`        | `sb_publishable_aZG3Uys_TSWawBO66WgcKw_QRFqwp6y` |
| mobile | `EXPO_PUBLIC_SUPABASE_URL` | same URL                                       |
| mobile | `EXPO_PUBLIC_SUPABASE_KEY` | same key                                       |

`.env` files are git-ignored; each app ships a `.env.example`. EAS build profiles carry the same values.

## Database migrations

Migrations in `supabase/migrations/` are **already applied to the live project** (`lvllwbqqvshruramhnrj`, ca-central-1). To push future migrations:

```bash
supabase login
supabase link --project-ref lvllwbqqvshruramhnrj
supabase db push
```

Add new migrations with `supabase migration new <name>`; never edit an applied migration.

## RLS tests

The Phase 0 tests are pgTAP in `supabase/tests/001_isolation.sql`.

**Locally** (Docker required):

```bash
supabase db start      # local Postgres 17 with the migrations applied
supabase test db       # runs every file in supabase/tests
```

`npm run test:db` prints the same instructions.

**Remotely** (no Docker): the MCP `execute_sql` tool and the dashboard SQL editor return only the last result set, so pgTAP's per-test lines are lost. `supabase/tests/run_remote.py` rewrites the test file so the full TAP report comes back as one row, inside a `begin; ... rollback;` so nothing persists:

```bash
python3 supabase/tests/run_remote.py supabase/tests/001_isolation.sql > /tmp/runner.sql
# paste /tmp/runner.sql into execute_sql or the SQL editor and read the `tap` column
```

CI runs the local flavour in the `db-tests` job with `continue-on-error: true`; treat it as informational until the local stack is proven stable.

## Phase 0 exit criterion

**Two organizations on one project, and a third that cannot see it.** `supabase/tests/001_isolation.sql` sets up Acme Contractors (owner of project "Site A"), Steelco (supplier) and Haulit (carrier) as members, and Rival Corp as an outsider, then asserts that members see the project, its shipments and events according to their roles while Rival Corp sees nothing. Phase 0 is done when that file passes against the live schema.
