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

### S0.3: Validated env module ⏳ PENDING
**Goal:** one typed, validated place for all configuration; fail fast on mistakes.

**Status:** Not started

---

### S0.4: Test harness with a real database ⏳ PENDING
**Goal:** integration tests that use Postgres, each starting from a clean state.

**Status:** Not started

---

### S0.5: Continuous integration ⏳ PENDING
**Goal:** every PR runs lint, typecheck, tests, and build.

**Status:** Not started

---

### S0.6: Dockerfile and migration runner ⏳ PENDING
**Goal:** a small, secure production image that can also run database migrations.

**Status:** Not started

---

### S0.7: Docker Compose (dev and prod) and CI Docker smoke test ⏳ PENDING
**Goal:** one command runs the whole stack locally, a hardened compose file runs production, and CI proves the image works.

**Status:** Not started

---

### S0.8: Release pipeline and deployment process ⏳ PENDING
**Goal:** publish versioned images and have a written, rehearsed procedure to deploy, upgrade, roll back and back up.

**Status:** Not started

---

## Summary

| Step | Status | Verified |
|------|--------|----------|
| S0.1 | ✅ Complete | All checks pass |
| S0.2 | ✅ Complete | All checks pass |
| S0.3 | ⏳ Pending | - |
| S0.4 | ⏳ Pending | - |
| S0.5 | ⏳ Pending | - |
| S0.6 | ⏳ Pending | - |
| S0.7 | ⏳ Pending | - |
| S0.8 | ⏳ Pending | - |

**Last Updated:** 2026-10-28