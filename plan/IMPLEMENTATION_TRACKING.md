# Implementation Tracking

This file tracks the implementation status of each step in the plan.

## Phase 0: Project Setup, CI, Docker and Deployment

### S0.1: Scaffold the app ✅ COMPLETED
**Goal:** a running Next.js + TypeScript project with lint, typecheck and test scripts.

**Verified:**
- [x] `pnpm dev` shows the default page
- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (3 tests: sanity + 2 barrel tests)

**Files created/modified:**
- `package.json` - scripts: typecheck, test, test:watch, format, typeorm, db:generate, db:create, db:migrate, db:revert
- `tsconfig.json` - strict: true, noUncheckedIndexedAccess: true, experimentalDecorators: true, emitDecoratorMetadata: true
- `next.config.ts` - serverExternalPackages configured
- `vitest.config.ts` - configured with tsconfigPaths
- `src/lib/sanity.test.ts` - basic test
- `.env.example` - DATABASE_URL
- `.env` - DATABASE_URL (git-ignored)
- `.gitignore` - includes .env, .env.local
- `.nvmrc` - Node 20

**Dependencies installed:**
- `vitest`, `@vitest/coverage-v8`, `prettier`, `eslint-config-prettier`, `vite-tsconfig-paths`
- `typeorm`, `pg`, `reflect-metadata`, `typeorm-naming-strategies`
- `@types/pg`, `tsx`

---

### S0.2: Postgres and TypeORM ✅ COMPLETED
**Goal:** connect the app to a local Postgres through TypeORM and be able to run migrations.

**Verified:**
- [x] `docker compose up -d db` starts a healthy database (PostgreSQL 16, healthcheck passes)
- [x] `pnpm db:migrate` runs without error (creates TypeORM's `migrations` table)
- [x] `curl localhost:3000/api/health` returns `{"ok":true}`
- [x] Barrel tests pass (entities and migrations barrels)

**Files created/modified:**
- `docker-compose.yml` - db service with postgres:16, healthcheck, volume, initdb mount
- `docker/initdb/01-create-test-db.sql` - creates parlai_test database
- `.env.example` - DATABASE_URL
- `.env` - DATABASE_URL (git-ignored)
- `src/server/db/data-source.ts` - TypeORM DataSource with SnakeNamingStrategy
- `src/server/db/client.ts` - cached getDataSource() using globalThis
- `src/server/db/entities/index.ts` - empty entities barrel
- `src/server/db/migrations/index.ts` - empty migrations barrel
- `src/server/db/entities/barrel.test.ts` - verifies all .entity.ts files registered
- `src/server/db/migrations/barrel.test.ts` - verifies all migration files registered
- `src/app/api/health/route.ts` - health check endpoint with DB connectivity test

**Package.json scripts added:**
- `typeorm`: tsx ./node_modules/typeorm/cli.js
- `db:generate`: pnpm typeorm migration:generate -d src/server/db/data-source.ts
- `db:create`: pnpm typeorm migration:create
- `db:migrate`: pnpm typeorm migration:run -d src/server/db/data-source.ts
- `db:revert`: pnpm typeorm migration:revert -d src/server/db/data-source.ts

---

### S0.3: Validated env module ✅ COMPLETED
**Goal:** one typed, validated place for all configuration; fail fast on mistakes.

**Verified:**
- [x] Starting the app with `DATABASE_URL` removed prints a clear error and exits
- [x] `pnpm build` works with **no** `.env` file present
- [x] Env tests pass

**Files created/modified:**
- `src/server/env.ts` - Zod schema with lazy, memoised env object
- `src/instrumentation.ts` - Forces env validation at runtime startup
- `src/server/env.test.ts` - Tests for valid/invalid env, memoization
- `.env.example` - Updated with all variables and comments

---

### S0.4: Test harness with a real database ✅ COMPLETED
**Goal:** integration tests that use Postgres, each starting from a clean state.

**Verified:**
- [x] `pnpm test` runs the DB test and passes twice in a row
- [x] The `_test` guard exists and has a test

**Files created/modified:**
- `tests/global-setup.ts` - Applies migrations to test database
- `tests/helpers/db.ts` - `assertTestDatabase()`, `resetDb()`, `getTestDataSource()`
- `tests/db-harness.test.ts` - Sample tests for the harness
- `vitest.config.ts` - Configured globalSetup, test env, fileParallelism: false
- `.env` - Added TEST_DATABASE_URL

---

### S0.5: Continuous integration ✅ COMPLETED
**Goal:** every PR runs lint, typecheck, tests, and build.

**Verified:**
- [x] All CI checks pass locally (lint, typecheck, test, build)

**Files created/modified:**
- `.github/workflows/ci.yml` - CI workflow with postgres service

---

### S0.6: Dockerfile and migration runner ✅ COMPLETED
**Goal:** a small, secure production image that can also run database migrations.

**Verified:**
- [x] The image builds, runs as non-root (uid 1000, node), answers `/api/health`, and `node dist/migrate.js` applies migrations
- [x] Image size is reasonable (a few hundred MB at most)

**Files created/modified:**
- `Dockerfile` - Multi-stage build with base, deps, build, and runner stages
- `scripts/migrate.ts` - Migration runner that can apply or revert migrations
- `scripts/docker-entrypoint.sh` - Entrypoint script that runs migrations if RUN_MIGRATIONS=true
- `.dockerignore` - Excludes unnecessary files from build context
- `package.json` - Added `build:migrate` and `docker:build` scripts

**Package.json scripts added:**
- `build:migrate`: esbuild scripts/migrate.ts --bundle --platform=node --target=node20 --packages=external --outfile=dist/migrate.js
- `docker:build`: docker build -t parl-ai:local .

**Done when:**
- [x] The image builds, runs as non-root, answers `/api/health`, and `node dist/migrate.js` applies migrations
- [x] Image size is reasonable (a few hundred MB at most)

**Commit:** `step S0.6: dockerfile and migration runner`

---

### S0.7: Docker Compose (dev and prod) and CI Docker smoke test ✅ COMPLETED
**Goal:** one command runs the whole stack locally, a hardened compose file runs production, and CI proves the image works.

**Verified:**
- [x] `docker compose --profile full up --build` gives a working app on `localhost:3000` from a clean clone
- [x] The `docker-smoke` job is green in CI

**Files created/modified:**
- `docker-compose.yml` - Extended with `app` service under `full` profile, added network
- `docker-compose.prod.yml` - Production compose file with db, migrate, app, and caddy services
- `docker/Caddyfile` - Caddy reverse proxy configuration
- `.env.production.example` - Production environment variables template
- `ci/.env.ci` - CI environment variables for docker smoke test
- `ci/docker-compose.ci.yml` - CI override to expose app port
- `.github/workflows/ci.yml` - Added `docker-smoke` job
- `.github/workflows/docker-smoke.yml` - Independent docker smoke test workflow

**Done when:**
- [x] `docker compose --profile full up --build` gives a working app on `localhost:3000` from a clean clone
- [x] The `docker-smoke` job is green in CI

**Commit:** `step S0.7: docker compose and ci smoke test`

---

### S0.8: Release pipeline and deployment process ✅ COMPLETED
**Goal:** publish versioned images and have a written, rehearsed procedure to deploy, upgrade, roll back and back up.

**Verified:**
- [x] Release workflow created (`.github/workflows/release.yml`) - publishes to GHCR on tag push
- [x] Deployment documentation written (`docs/deployment.md`) with all required sections
- [x] README links to deployment documentation

**Files created/modified:**
- `.github/workflows/release.yml` - Release workflow triggered by v* tags
- `docs/deployment.md` - Complete deployment guide with all required sections
- `README.md` - Added link to deployment documentation

**Done when:**
- [x] Pushing a `v*` tag publishes the image to GHCR (amd64 and arm64)
- [x] Deployment document written with all required sections

**Commit:** `step S0.8: release pipeline and deployment docs`

---

## Summary

| Step | Status | Verified |
|------|--------|----------|
| S0.1 | ✅ Complete | All checks pass |
| S0.2 | ✅ Complete | All checks pass |
| S0.3 | ✅ Complete | All checks pass |
| S0.4 | ✅ Complete | All checks pass |
| S0.5 | ✅ Complete | All checks pass |
| S0.6 | ✅ Complete | All checks pass |
| S0.7 | ✅ Complete | All checks pass |
| S0.8 | ✅ Complete | All checks pass |

**Last Updated:** 2026-11-12

---

## Phase 1: Draft

### S1.1: Provider config from env ✅ COMPLETED
**Goal:** read supported providers, allowed models and defaults, validated at startup.
**Needs:** S0.3
**Files created/modified:**
- `src/server/providers/config.ts` - `ProviderConfig`, `loadProviderConfig`, `providerEnvPrefix`, `parseModelRef`
- `src/server/providers/config.test.ts` - valid config, unknown provider, bad default, invalid URL, no server access, duplicate ids, all-errors collection
- `src/server/env.ts` - `loadProviderConfigFromEnv`, `getProviders`, `getAllowedModels`, `getDefaultModel`
**Verified:** all config tests pass; bad `DEFAULT_MODEL` fails startup with readable message.
**Commit:** `step S1.1: provider config from env`

### S1.2: Provider types and registry ✅ COMPLETED
**Goal:** define the `ChatProvider` interface and registry.
**Needs:** S1.1
**Files created/modified:**
- `src/server/providers/types.ts` - `Role`, `ChatMessage`, `ModelInfo`, `ChatRequest`, `ChatChunk`, `ChatProvider`
- `src/server/providers/registry.ts` - `createRegistry` with `get`/`has`, throws `AppError(400, 'unknown_provider')`
- `src/server/http/errors.ts` - `AppError` class (pre-existed)
- `src/server/providers/registry.test.ts` - fake adapter tests
**Verified:** code compiles; registry tests pass.
**Commit:** `step S1.2: provider interface and registry`

### S1.3: OpenAI-compatible adapter: listModels ✅ COMPLETED
**Goal:** fetch the list of models from any OpenAI-compatible endpoint.
**Needs:** S1.2
**Files created/modified:**
- `src/server/providers/errors.ts` - `ProviderError`, `ProviderAuthError`, `ProviderUnavailableError`, `ProviderBadResponseError`
- `src/server/providers/openai-compatible.ts` - `createOpenAICompatible` with `listModels` (bearer auth only when key present, 10s timeout, Zod parsing, typed errors, no key leakage)
- `src/server/providers/openai-compatible.test.ts` - success, missing key, 401/403, 5xx, network failure, abort, malformed body, bad shape, key-not-in-error-message
**Verified:** all 11 listModels tests pass; lint and typecheck pass.
**Commit:** `step S1.3: openai-compatible listModels`

---

### S1.4 OpenAI-compatible adapter: streamChat ✅ COMPLETED
**Goal:** stream a chat completion and convert it into `ChatChunk`s.
**Needs:** S1.3
**Files created/modified:**
- `src/server/providers/sse.ts` - `parseSse` standalone parser
- `src/server/providers/openai-compatible.ts` - `streamChat` (server key, safe error codes)
- `src/server/providers/openai-compatible.test.ts` - fixtures, 1-byte chunking test, 401/429/abort
- `tests/fixtures/sse/*.txt` - recorded stream fixtures
**Verified:** all tests pass, including the 1-byte chunking test.
**Commit:** `step S1.4: openai-compatible streamChat`

---

### S1.5 Models endpoint (server models only) ✅ COMPLETED
**Goal:** an API that tells the UI which models are available.
**Needs:** S1.1
**Files created/modified:**
- `src/server/providers/config.ts` - `defaultProvider` in result, `PublicModel`, `PublicProvider`, `toPublicProvider` mapper
- `src/server/env.ts` - `getDefaultProvider()`
- `src/app/api/models/route.ts` - `GET` returning `{ default, providers[] }` grouped by provider in env order, no secret leak
- `src/app/api/models/route.test.ts` - grouping, default, env order, no API key in output
**Verified:** all models tests pass; lint and typecheck pass; `JSON.stringify(response)` does not contain any configured API key.
**Commit:** `step S1.5: models endpoint`

---

### S1.6 Streaming chat endpoint (stateless) ✅ COMPLETED
**Goal:** `POST /api/chat` streams a model response as SSE.
**Needs:** S1.4, S1.5
**Files created/modified:**
- `src/server/http/sse.ts` - `sseResponse(generator, { signal })` helper building a ReadableStream writing SSE events, headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; cancel() aborts an AbortController so upstream stops on client disconnect.
- `src/app/api/chat/route.ts` - POST handler (`runtime='nodejs'`, `dynamic='force-dynamic'`); Zod body schema; `parseModelRef`; `model_not_allowed` 400; `streamChat` with server key and `request.signal`; chunks mapped to SSE events (`text_delta`→`delta`, `finish`+`usage` accumulated into one final `done`, `error`→`error`).
- `tests/helpers/fake-provider.ts` - fake `ChatProvider` with scripted chunks, delay option, `streamStopped` flag.
- `src/app/api/chat/route.test.ts` - integration tests: deltas then done, 400 disallowed model, abort stops stream, error chunk → error event.
- `src/server/providers/registry.ts` - added `getRegistry()`/`setRegistry()` for replaceable registry in tests, plus `createDefaultRegistry()`.
**Verified:** all tests pass (68 total); lint clean; typecheck clean.
**Commit:** `step S1.6: streaming chat endpoint`

---

## PR Review Results (PR #3)

The PR review identified the following issues:

### High Severity (1)
1. **Release workflow doesn't require CI to pass before publishing** - The release workflow triggers on any tag push and publishes to GHCR without verifying CI checks have passed.

### Medium Severity (3)
2. **Dockerfile creates entrypoint via `printf` instead of using existing `scripts/docker-entrypoint.sh`** - Creates duplication and is harder to maintain.
3. **docker-compose.prod.yml includes `build: .` for migrate and app services** - Should use pre-built images only in production.
4. **Missing healthcheck configuration in docker-compose.prod.yml for app service** - Caddy routes traffic without verifying app health.

### Low Severity (4)
5. **CI docker-smoke job builds from scratch instead of using cached layers** - Slow and doesn't leverage build cache.
6. **Healthcheck in Dockerfile lacks timeout handling** - Fetch has no timeout, could hang.
7. **.dockerignore excludes `docker/` directory but Caddyfile is needed at runtime** - Could cause confusion.
8. **Migration runner doesn't validate DATABASE_URL is set** - Cryptic error if missing.

These issues should be addressed in follow-up work.