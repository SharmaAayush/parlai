# Phase 0: Project setup, CI, Docker and deployment

Read `00-README.md` first (rules, conventions, TypeORM patterns).

**What you have at the end of Phase 0:** a running Next.js app, a PostgreSQL database with TypeORM migrations, a test harness, CI on every PR, a production-ready Docker image, Docker Compose files for local and production use, and a written, tested deployment process. Every later step must keep all of this working (README rules 10 and 11).

| Step | Result |
|---|---|
| S0.1 | Next.js project with lint, typecheck, tests |
| S0.2 | Postgres + TypeORM + migrations + health check |
| S0.3 | Validated env module |
| S0.4 | Database test harness |
| S0.5 | CI (lint, typecheck, tests, build) |
| S0.6 | Dockerfile + migration runner |
| S0.7 | Docker Compose (dev and prod) + CI Docker smoke test |
| S0.8 | Release pipeline and deployment process |

---

## S0.1 Scaffold the app
**Goal:** a running Next.js + TypeScript project with lint, typecheck and test scripts.
**Needs:** nothing.

**Instructions**
1. Run `pnpm create next-app@latest parl-ai` and choose: TypeScript yes, ESLint yes, Tailwind yes, `src/` directory yes, App Router yes, import alias `@/*`.
2. In `tsconfig.json` make sure `"strict": true`. Also add `"noUncheckedIndexedAccess": true` (catches many array bugs).
3. Install tooling: `pnpm add -D vitest @vitest/coverage-v8 prettier eslint-config-prettier vite-tsconfig-paths`.
4. Create `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   import tsconfigPaths from 'vite-tsconfig-paths';
   export default defineConfig({
     plugins: [tsconfigPaths()],
     test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
   });
   ```
5. Add scripts in `package.json`: `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"format": "prettier --write ."`.
6. Create `src/lib/sanity.test.ts` with `expect(1 + 1).toBe(2)` to prove the test runner works.
7. Add `.env` and `.env.local` to `.gitignore`. Never commit secrets. Add an `.nvmrc` containing `20`.

**Watch out:** Next.js 15+ makes `cookies()` and `headers()` **async**; always `await` them.

**Done when**
- [ ] `pnpm dev` shows the default page.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

**Commit:** `step S0.1: scaffold next app with tooling`

---

## S0.2 Postgres and TypeORM
**Goal:** connect the app to a local Postgres through TypeORM and be able to run migrations.
**Needs:** S0.1

**Instructions**
1. Create `docker-compose.yml` (local development) with a `db` service: image `postgres:16`, env `POSTGRES_USER=parlai`, `POSTGRES_PASSWORD=parlai`, `POSTGRES_DB=parlai`, port `5432:5432`, a named volume `pgdata`, a healthcheck (`pg_isready -U parlai -d parlai`, interval 5s, retries 10). Mount `./docker/initdb:/docker-entrypoint-initdb.d:ro` and create `docker/initdb/01-create-test-db.sql` containing `CREATE DATABASE parlai_test;` (used in S0.4). The init scripts run only the first time the volume is created; to re-run them use `docker compose down -v`.
2. Create `.env` (git-ignored) with `DATABASE_URL=postgres://parlai:parlai@localhost:5432/parlai` and a committed `.env.example` with the same line.
3. Install: `pnpm add typeorm pg reflect-metadata typeorm-naming-strategies` and `pnpm add -D @types/pg tsx`.
4. In `tsconfig.json` add `"experimentalDecorators": true` and `"emitDecoratorMetadata": true`. Use the definite assignment marker `!` on entity properties (`id!: string`) instead of loosening `strict`.
5. In `next.config.ts` add `serverExternalPackages: ['typeorm', 'pg', 'reflect-metadata', 'typeorm-naming-strategies']`. (Next must not bundle these; later steps add `@node-rs/argon2` and others to this list.)
6. Create the barrels (empty for now):
   - `src/server/db/entities/index.ts`: `export const entities: Function[] = [];`
   - `src/server/db/migrations/index.ts`: `export const migrations: Function[] = [];`
   Entities and migrations are listed **explicitly**, never by file glob, because globs break when the app is bundled.
7. Create `src/server/db/data-source.ts`:
   ```ts
   import 'reflect-metadata';
   import pg from 'pg';
   import { DataSource } from 'typeorm';
   import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
   import { entities } from './entities';
   import { migrations } from './migrations';

   // Relative imports only in this folder (README rule 11).
   export function createDataSource(url = process.env.DATABASE_URL) {
     return new DataSource({
       type: 'postgres',
       url,
       driver: pg,                    // static import so Docker's file tracing includes `pg`
       namingStrategy: new SnakeNamingStrategy(),
       entities,
       migrations,
       synchronize: false,            // NEVER true
       logging: ['error', 'warn'],
     });
   }
   export default createDataSource();   // the TypeORM CLI needs a default export
   ```
8. Create `src/server/db/client.ts`: `getDataSource()` that returns a **cached, initialised** DataSource. Cache the promise on `globalThis` (so hot reload in dev does not open a new pool on every edit):
   ```ts
   const g = globalThis as unknown as { __ds?: Promise<DataSource> };
   export function getDataSource() {
     g.__ds ??= createDataSource().initialize();
     return g.__ds;
   }
   ```
9. Add scripts (they run TypeScript through `tsx`):
   ```json
   "typeorm": "tsx ./node_modules/typeorm/cli.js",
   "db:generate": "pnpm typeorm migration:generate -d src/server/db/data-source.ts",
   "db:create": "pnpm typeorm migration:create",
   "db:migrate": "pnpm typeorm migration:run -d src/server/db/data-source.ts",
   "db:revert": "pnpm typeorm migration:revert -d src/server/db/data-source.ts"
   ```
   Usage later: `pnpm db:generate src/server/db/migrations/CoreSchema` (TypeORM prepends a timestamp to the class/file name).
10. Write two **barrel tests** so nobody forgets to register files:
    - `src/server/db/entities/barrel.test.ts`: read the folder, count files ending in `.entity.ts`, assert that number equals `entities.length`.
    - `src/server/db/migrations/barrel.test.ts`: count `*.ts` files other than `index.ts`, assert equals `migrations.length`.
11. Create `src/app/api/health/route.ts` returning `{ ok: true }` after `(await getDataSource()).query('select 1')`; return 503 with `{ ok: false }` on failure. Add `export const dynamic = 'force-dynamic'`.

**Watch out**
- Without `reflect-metadata` imported first, TypeORM crashes with a confusing decorator error. Keep the import at the top of `data-source.ts`.
- Do not set `synchronize: true` "just for now". It can drop columns in production.
- With no entities yet, `pnpm db:generate` says "No changes found". That is expected. The first real migration comes in step A1.

**Done when**
- [ ] `docker compose up -d db` starts a healthy database.
- [ ] `pnpm db:migrate` runs without error (it creates TypeORM's `migrations` table).
- [ ] `curl localhost:3000/api/health` returns `{"ok":true}`.
- [ ] Barrel tests pass.

**Commit:** `step S0.2: postgres and typeorm setup`

---

## S0.3 Validated env module
**Goal:** one typed, validated place for all configuration; fail fast on mistakes.
**Needs:** S0.1

**Instructions**
1. `pnpm add zod`.
2. Create `src/server/env.ts` with a Zod schema for the base variables: `DATABASE_URL` (string, URL), `APP_URL` (URL, default `http://localhost:3000`), `NODE_ENV`.
3. Export `parseEnv(source: Record<string, string | undefined>)` that runs the schema and, on failure, throws an `Error` listing **every** problem (use `error.issues.map(...)`). Keeping `parseEnv` separate lets tests pass fake env objects.
4. Export `env` as a **lazy, memoised** object (a `Proxy` that calls `parseEnv(process.env)` the first time any property is read). Reason: `next build` imports route files, and the Docker build has no real configuration. Nothing is validated at build time because nothing is read.
5. Keep **fail-fast at runtime**: create `src/instrumentation.ts` exporting `register()` that, when `process.env.NEXT_RUNTIME === 'nodejs'` and `process.env.NEXT_PHASE !== 'phase-production-build'`, reads `env.APP_URL` once. A bad configuration then stops the server at startup, with a readable message.
6. Update `.env.example` with all variables and a comment per variable.
7. Write `src/server/env.test.ts`: valid input passes; missing `DATABASE_URL` fails with a message that names it; bad URL fails; reading properties is memoised (the parser runs once).

**Watch out:** never import `env.ts` from client components (it holds secrets). Anything the browser needs goes in `src/lib/` or a `NEXT_PUBLIC_` variable.

**Done when**
- [ ] Starting the app with `DATABASE_URL` removed prints a clear error and exits.
- [ ] `pnpm build` works with **no** `.env` file present.
- [ ] Env tests pass.

**Commit:** `step S0.3: validated lazy env module`

---

## S0.4 Test harness with a real database
**Goal:** integration tests that use Postgres, each starting from a clean state.
**Needs:** S0.2, S0.3

**Instructions**
1. Add `TEST_DATABASE_URL=postgres://parlai:parlai@localhost:5432/parlai_test` to `.env.example` and `.env`. The `parlai_test` database is created by the init script from S0.2. (If your volume already existed, run `docker compose exec db createdb -U parlai parlai_test` once.)
2. Create `tests/global-setup.ts` and register it in `vitest.config.ts` (`test.globalSetup`). It must: load `.env`; build a DataSource with `TEST_DATABASE_URL`; `initialize()`; `runMigrations()`; `destroy()`.
3. In test files, the code under test uses `DATABASE_URL`, so in the Vitest config set `test.env: { DATABASE_URL: process.env.TEST_DATABASE_URL }` (load `.env` first with `dotenv`).
4. Create `tests/helpers/db.ts`:
   - `assertTestDatabase()`: throws unless the database name in the URL ends with `_test` (this protects your dev data; add a unit test for it);
   - `resetDb()`: `TRUNCATE` every table in schema `public` except `migrations`, using `RESTART IDENTITY CASCADE`. Get the table names from `pg_tables`.
   - `getTestDataSource()`: returns `getDataSource()` from the app (same connection code as production).
5. In every test that touches the DB: `beforeEach(resetDb)`. After the whole run close the connection (`afterAll`).
6. Set `test.fileParallelism = false` in the Vitest config (tests share one database; simple and reliable).
7. Add one sample test that runs `select 1` and checks `resetDb` runs without error.

**Watch out:** if `resetDb` ever runs against your dev database you lose data. The `_test` guard exists for that. Call `assertTestDatabase()` inside `resetDb`.

**Done when**
- [ ] `pnpm test` runs the DB test and passes twice in a row.
- [ ] The `_test` guard exists and has a test.

**Commit:** `step S0.4: db test harness`

---

## S0.5 Continuous integration
**Goal:** every PR runs lint, typecheck, tests, and build.
**Needs:** S0.4

**Instructions**
1. Create `.github/workflows/ci.yml`: trigger on `pull_request` and on `push` to `main`. Job `checks`:
   - service `postgres:16` with user/password `parlai`, database `parlai_test`, a health check;
   - steps: checkout, `pnpm/action-setup`, `actions/setup-node` (Node 20, pnpm cache), `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
   - env: `TEST_DATABASE_URL`, `DATABASE_URL` (both pointing at the service), `APP_URL`.
2. Use `concurrency` with `cancel-in-progress: true` so old runs stop when you push again.
3. S0.7 adds a second job (`docker-smoke`) to this file. Each later step that adds required env variables must also add dummy values here (note it in the step's PR).
4. In GitHub settings, require the `checks` job to pass before merging to `main`.

**Done when**
- [ ] A PR shows a green `checks` run.

**Commit:** `step S0.5: ci workflow`

---

## S0.6 Dockerfile and migration runner
**Goal:** a small, secure production image that can also run database migrations.
**Needs:** S0.2, S0.3, S0.5

**Instructions**
1. In `next.config.ts` set `output: 'standalone'`. This makes `next build` produce a minimal server in `.next/standalone`.
2. Create the migration runner `scripts/migrate.ts` (relative imports only):
   ```ts
   import createDataSourceDefault from '../src/server/db/data-source';  // default export is a DataSource
   async function main() {
     const revert = process.argv.includes('--revert');
     const ds = await createDataSourceDefault.initialize();
     try {
       if (revert) { await ds.undoLastMigration({ transaction: 'each' }); console.log('Reverted last migration'); }
       else {
         const done = await ds.runMigrations({ transaction: 'each' });
         console.log(done.length ? `Applied: ${done.map((m) => m.name).join(', ')}` : 'No pending migrations');
       }
     } finally { await ds.destroy(); }
   }
   main().catch((e) => { console.error(e); process.exit(1); });
   ```
   Never print the connection string.
3. Bundle it for production: `pnpm add -D esbuild` and add the script
   `"build:migrate": "esbuild scripts/migrate.ts --bundle --platform=node --target=node20 --packages=external --outfile=dist/migrate.js"`.
   It bundles **our** code (entities, migrations) and leaves npm packages external; they come from the image's `node_modules`.
4. Create `scripts/docker-entrypoint.sh` (make it executable with `chmod +x`):
   ```sh
   #!/bin/sh
   set -e
   if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
     node dist/migrate.js
   fi
   exec "$@"
   ```
5. Create `.dockerignore`: `node_modules`, `.next`, `.git`, `dist`, `.env*` (but keep `.env.example` out too; it is not needed), `tests`, `docs`, `plan`, `*.md`.
6. Create `Dockerfile`:
   ```dockerfile
   # syntax=docker/dockerfile:1
   ARG NODE_VERSION=20

   FROM node:${NODE_VERSION}-bookworm-slim AS base
   ENV NEXT_TELEMETRY_DISABLED=1
   RUN corepack enable
   WORKDIR /app

   FROM base AS deps
   COPY package.json pnpm-lock.yaml ./
   RUN pnpm install --frozen-lockfile

   FROM base AS build
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .
   RUN pnpm build && pnpm build:migrate

   FROM node:${NODE_VERSION}-bookworm-slim AS runner
   ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
   WORKDIR /app
   COPY --from=build --chown=node:node /app/.next/standalone ./
   COPY --from=build --chown=node:node /app/.next/static ./.next/static
   COPY --from=build --chown=node:node /app/public ./public
   COPY --from=build --chown=node:node /app/dist/migrate.js ./dist/migrate.js
   COPY --chown=node:node scripts/docker-entrypoint.sh ./docker-entrypoint.sh
   USER node
   EXPOSE 3000
   HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
     CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
   ENTRYPOINT ["./docker-entrypoint.sh"]
   CMD ["node", "server.js"]
   ```
   Why Debian "slim" and not Alpine: native packages added later (e.g. `@node-rs/argon2`) ship ready-made binaries for it, with fewer surprises.
7. Add an npm script `"docker:build": "docker build -t parl-ai:local ."`.
8. Verify the image yourself:
   - `pnpm docker:build`
   - `docker run --rm parl-ai:local id` prints a non-root user (uid 1000, `node`);
   - run it with env: `docker run --rm -p 3000:3000 -e DATABASE_URL=postgres://parlai:parlai@host.docker.internal:5432/parlai -e APP_URL=http://localhost:3000 --add-host host.docker.internal:host-gateway -e RUN_MIGRATIONS=true parl-ai:local` and open `/api/health`;
   - `docker run --rm parl-ai:local node dist/migrate.js` fails cleanly (no `DATABASE_URL`) without crashing weirdly.

**Watch out**
- If the container says `Cannot find module 'typeorm'` or `'pg'`, the standalone trace missed it. The health route imports the data source (which statically imports `pg`), which is what makes Next include them. Check that `src/app/api/health/route.ts` really imports `getDataSource`, and that new packages used only by scripts are also imported somewhere the app uses.
- esbuild ignores `emitDecoratorMetadata`. That is why README rule 11 requires explicit column types. If a column behaves oddly (wrong type), look for a missing `type`.
- `next build` must work with no env at all (S0.3). If the Docker build fails with an env error, something reads `env` at module top level. Move that read inside a function.
- Never put secrets in the Dockerfile (`ENV`/`ARG`). Configuration comes at run time.

**Done when**
- [ ] The image builds, runs as non-root, answers `/api/health`, and `node dist/migrate.js` applies migrations.
- [ ] Image size is reasonable (a few hundred MB at most). Note the number in `docs/deployment.md`.

**Commit:** `step S0.6: dockerfile and migration runner`

---

## S0.7 Docker Compose (dev and prod) and CI Docker smoke test
**Goal:** one command runs the whole stack locally, a hardened compose file runs production, and CI proves the image works.
**Needs:** S0.6

**Instructions**
1. **Local full stack.** Extend `docker-compose.yml` (from S0.2) with an `app` service under the profile `full`:
   ```yaml
   app:
     profiles: ["full"]
     build: .
     env_file: .env
     environment:
       DATABASE_URL: postgres://parlai:parlai@db:5432/parlai
       RUN_MIGRATIONS: "true"
     ports: ["3000:3000"]
     depends_on:
       db: { condition: service_healthy }
     extra_hosts: ["host.docker.internal:host-gateway"]   # reach Ollama on the host (Linux too)
   ```
   Run with `docker compose --profile full up --build`. Plain `docker compose up -d db` still starts only the database.
2. **Production file** `docker-compose.prod.yml`:
   ```yaml
   services:
     db:
       image: postgres:16
       restart: unless-stopped
       environment:
         POSTGRES_USER: parlai
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
         POSTGRES_DB: parlai
       volumes: [pgdata:/var/lib/postgresql/data]
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U parlai -d parlai"]
         interval: 5s
         timeout: 3s
         retries: 20
       # no published ports: only other containers can reach it

     migrate:
       image: ${PARLAI_IMAGE:-parl-ai:local}
       build: .
       command: ["node", "dist/migrate.js"]
       env_file: .env.production
       environment:
         DATABASE_URL: postgres://parlai:${POSTGRES_PASSWORD}@db:5432/parlai
       depends_on: { db: { condition: service_healthy } }
       restart: "no"

     app:
       image: ${PARLAI_IMAGE:-parl-ai:local}
       restart: unless-stopped
       env_file: .env.production
       environment:
         DATABASE_URL: postgres://parlai:${POSTGRES_PASSWORD}@db:5432/parlai
       depends_on:
         db: { condition: service_healthy }
         migrate: { condition: service_completed_successfully }
       expose: ["3000"]

     caddy:                    # optional HTTPS reverse proxy
       profiles: ["proxy"]
       image: caddy:2
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       environment: { DOMAIN: "${DOMAIN:?set DOMAIN}" }
       volumes: ["./docker/Caddyfile:/etc/caddy/Caddyfile:ro", "caddy_data:/data", "caddy_config:/config"]
       depends_on: [app]

   volumes: { pgdata: {}, caddy_data: {}, caddy_config: {} }
   ```
   Why a separate `migrate` service: if you run two copies of the app, migrations must run **once**, not once per copy.
3. Create `docker/Caddyfile`:
   ```
   {$DOMAIN} {
     reverse_proxy app:3000 {
       flush_interval -1      # do not buffer: needed for streaming (SSE) responses
     }
   }
   ```
4. Create `.env.production.example` listing every variable with comments (copy from `.env.example`; production-only ones: `POSTGRES_PASSWORD`, `DOMAIN`, `PARLAI_IMAGE`, `TRUST_PROXY=true`). Real `.env.production` is git-ignored (add it to `.gitignore`).
5. **CI smoke test.** Create `ci/.env.ci` (dummy, non-secret values: `POSTGRES_PASSWORD=ci-password`, `APP_URL=http://localhost:3000`, `DOMAIN=localhost`) and `ci/docker-compose.ci.yml` that only adds `ports: ["3000:3000"]` to `app`. Add job `docker-smoke` to `ci.yml`:
   ```yaml
   docker-smoke:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - name: Start stack
         run: |
           cp ci/.env.ci .env.production
           docker compose --env-file ci/.env.ci -f docker-compose.prod.yml -f ci/docker-compose.ci.yml up -d --build --wait --wait-timeout 180
       - name: Health check
         run: curl --fail --retry 10 --retry-delay 3 http://localhost:3000/api/health
       - name: Logs on failure
         if: failure()
         run: docker compose -f docker-compose.prod.yml -f ci/docker-compose.ci.yml logs
       - name: Tear down
         if: always()
         run: docker compose -f docker-compose.prod.yml -f ci/docker-compose.ci.yml down -v
   ```
   (`--wait` waits for healthchecks. The Dockerfile HEALTHCHECK covers `app`.) From now on, this job fails the PR if a later change breaks the image, the migrations, or startup configuration. If a later step adds required env variables, add dummy values to `ci/.env.ci`.
6. Test locally: `cp .env.production.example .env.production`, fill the values, `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait`, open `/api/health`, then `docker compose -f docker-compose.prod.yml down`.

**Watch out**
- Compose reads variables for `${...}` substitution from `--env-file` (or `.env`), while `env_file:` passes variables into the container. The commands above use both, with the same file.
- `down -v` deletes the database volume. Never run it on a real deployment.
- Without `proxy` profile there is no HTTPS. Do not expose the app's port 3000 publicly on a real server; secure cookies (`Secure`) need HTTPS (see A3).

**Done when**
- [ ] `docker compose --profile full up --build` gives a working app on `localhost:3000` from a clean clone.
- [ ] The `docker-smoke` job is green in CI, and you have seen it fail when you deliberately break the Dockerfile (then revert).

**Commit:** `step S0.7: docker compose and ci smoke test`

---

## S0.8 Release pipeline and deployment process
**Goal:** publish versioned images and have a written, rehearsed procedure to deploy, upgrade, roll back and back up.
**Needs:** S0.7

**Instructions**
1. **Release workflow.** Create `.github/workflows/release.yml`, triggered by tags like `v0.1.0`:
   ```yaml
   name: release
   on: { push: { tags: ["v*"] } }
   permissions: { contents: read, packages: write }
   jobs:
     image:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: docker/setup-qemu-action@v3
         - uses: docker/setup-buildx-action@v3
         - uses: docker/login-action@v3
           with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
         - id: meta
           uses: docker/metadata-action@v5
           with:
             images: ghcr.io/${{ github.repository }}
             tags: |
               type=semver,pattern={{version}}
               type=raw,value=latest
         - uses: docker/build-push-action@v6
           with:
             context: .
             push: true
             platforms: linux/amd64,linux/arm64
             tags: ${{ steps.meta.outputs.tags }}
             labels: ${{ steps.meta.outputs.labels }}
             cache-from: type=gha
             cache-to: type=gha,mode=max
   ```
   (Image names must be lower case; `github.repository` usually already is. Make the package public or give the server a read token.)
2. **Write `docs/deployment.md`.** Required sections, each with exact commands:
   1. *Requirements:* a Linux server with Docker and the compose plugin; a domain whose DNS points at the server; ports 80 and 443 open.
   2. *First deploy:*
      - copy `docker-compose.prod.yml`, `docker/Caddyfile` and `.env.production.example` to `/opt/parl-ai/`;
      - `cp .env.production.example .env.production`; generate secrets with `openssl rand -base64 32` (database password, later: encryption keys and cookie secrets); set `DOMAIN`, `APP_URL=https://<domain>`, `TRUST_PROXY=true`, `PARLAI_IMAGE=ghcr.io/<owner>/parl-ai:<version>`, provider variables;
      - `chmod 600 .env.production`;
      - `docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy up -d --wait`;
      - verify: `docker compose ps`, `curl -f https://<domain>/api/health`, `docker compose logs --tail=100 app`.
   3. *Upgrade:* change `PARLAI_IMAGE` to the new tag; `docker compose ... pull`; `docker compose ... up -d --wait` (the `migrate` service runs first, the app starts only if it succeeds); verify health; check logs.
   4. *Rollback:* set `PARLAI_IMAGE` back to the previous tag and `up -d`. Database changes are **not** undone by that. Rule for all migrations from now on: write them **backward compatible for one release** (add columns/tables first, remove old ones in a later release). To revert the last migration explicitly: `docker compose ... run --rm migrate node dist/migrate.js --revert` (only when the old image needs it).
   5. *Backups:* `docker compose exec -T db pg_dump -U parlai -Fc parlai > /backups/parlai-$(date +%F).dump`; schedule with cron (daily), keep at least 7, copy off the server; restore: `docker compose exec -T db pg_restore -U parlai -d parlai --clean --if-exists < file.dump` on a stopped app. **Test a restore** at least once.
   6. *Secrets:* where they live, who can read them, and the warning that **losing `KEY_ENCRYPTION_KEYS` makes every stored user API key unrecoverable**, so back them up separately from the database dump.
   7. *Environment variable table:* name, required?, example, description. Keep in sync (README rule 10).
   8. *Troubleshooting:* app restarting (read logs, usually a bad env value), `migrate` failed, health check failing, 502 from Caddy, streaming responses arrive all at once (proxy buffering).
3. **Rehearse it.** On a throwaway VM (or a local VM) follow `docs/deployment.md` literally with a real tag: first deploy, then push another tag and upgrade, then roll back. Fix the document wherever you had to improvise.
4. Add a short "Deploying" link from the README to `docs/deployment.md`.

**Watch out**
- The first tag requires the workflow file to exist on the default branch.
- Never run `docker compose down -v` on the server (deletes the database volume).
- Pin versions in production (`0.1.3`), not `latest`, so upgrades and rollbacks are deliberate.

**Done when**
- [ ] Pushing a `v*` tag publishes the image to GHCR (amd64 and arm64).
- [ ] You completed first deploy, upgrade and rollback by following only the document, and a backup was restored once.

**Commit:** `step S0.8: release pipeline and deployment docs`
