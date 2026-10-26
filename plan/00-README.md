# Parl-ai: Detailed Implementation Plan

Parl-ai is a provider-agnostic AI chat app (Next.js full-stack + PostgreSQL). This plan breaks the project into small steps. Each step is written so that a motivated junior developer (or an AI agent) can do it without guessing.

## Files in this plan

| File | Contents |
|---|---|
| `00-README.md` | This file: how to work, conventions, shared patterns, glossary |
| `01-phase0-setup-ci-docker.md` | Phase 0: project setup, TypeORM, tests, CI, Docker image, Docker Compose, deployment process |
| `02-phase1-draft.md` | Phase 1 (Draft): streaming chat, env-driven providers |
| `03-mvp-accounts-and-authz.md` | MVP A (accounts) and B (ABAC authorization) |
| `04-mvp-keys-models-chats.md` | MVP C (your own API keys), D (model access and catalog), E (persistent chats) |
| `05-mvp-guests-tracking-hardening.md` | MVP F (guests), G (tracking), H (hardening) |
| `06-v2-memory.md` | V2: Memory |
| `07-v3-projects-v4-export-release.md` | V3: Projects, V4: Export, Release readiness |

Step IDs: `S0.x` setup, `S1.x` draft, `A1..` accounts, `B1..` authorization, `C1..` keys, `D1..` models, `E1..` chats, `F1..` guests, `G1..` tracking, `H1..` hardening, `M1..` memory, `P1..` projects, `X1..` export, `R1..` release.
(These IDs replace the numbering in the earlier, shorter plan.)

---

## 1. How to work through a step

1. Read the **whole step** first, including "Watch out".
2. Check **Needs**: every listed step must be finished and merged.
3. Create a branch: `git checkout -b step-<ID>-<short-name>`.
4. Do the numbered **Instructions** in order. Write the tests as you go, not at the end.
5. Run the checks (below). Fix everything.
6. Walk through **Done when** and tick every item honestly.
7. Commit using the given message, open a PR, merge.

**Stuck?** Re-read the step's "Watch out". If still stuck, do not invent features: write down the question in `docs/questions.md` and ask.

**AI agents:** do exactly one step per session. Do not refactor unrelated code. If a step seems to require changing something outside its listed files, stop and note it in `docs/questions.md`.

### Checks to run before every commit

```bash
pnpm lint
pnpm typecheck
pnpm test
```
A step is never "done" with any of these failing.

---

## 2. Technology decisions

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript `strict: true` |
| Package manager | pnpm |
| Database | PostgreSQL 16 (Docker Compose locally) |
| ORM and migrations | TypeORM (entities + repositories) with `pg`; migrations committed to git; `synchronize` is never used. `typeorm-naming-strategies` for snake_case columns |
| Containers | Docker (multi-stage image), Docker Compose for local and production, GitHub Container Registry for images |
| Validation | Zod (env, request bodies, provider responses) |
| Auth | Custom email/password, DB-backed sessions, Argon2id (`@node-rs/argon2`) |
| Streaming | Server-Sent Events (SSE) from route handlers |
| UI | Tailwind CSS, shadcn/ui, `react-markdown`, `remark-gfm`, `rehype-highlight` |
| Tokenizer | `js-tiktoken` |
| Encryption | Node built-in `crypto` (AES-256-GCM) |
| Tests | Vitest (unit + integration), Playwright (a few end-to-end flows), MSW or `undici` MockAgent for fake HTTP |
| Guest fingerprint | `@fingerprintjs/fingerprintjs` (open source) |
| Email | Nodemailer, optional |

---

## 3. Global rules (every step must obey these)

1. **Authorization is enforced on the server.** Hiding a button is not security. After step B2, every protected action goes through `can(...)`.
2. **Never log or return secrets:** API keys, password hashes, session tokens, `Authorization` headers.
3. **Never trust client input for server-owned fields:** `role`, `ownerUserId`, `ownerGuestId`, `keySource` (when derived), `userId`. Write Zod schemas that list allowed fields explicitly. Never do `repo.save({ ...body })` or `repo.insert(body)`.
4. **Model ids:** always `providerId:modelId`. Split on the **first** colon only. `local:llama3.1:8b` means provider `local`, model `llama3.1:8b`.
5. **Provider URLs come only from env.** No user input may ever influence an outbound URL.
6. **All env reads go through `src/server/env.ts`.** Nobody else touches `process.env`. The only exception is `DATABASE_URL`, read directly in `src/server/db/data-source.ts`, so the migration runner can start without the full app configuration (it must not need encryption keys, provider settings, etc.).
7. **Every schema change has a migration, every policy has tests.**
8. **Only `src/server/providers/` may know about provider-specific formats.**
9. **Small functions, pure where possible.** Put logic in plain functions that are easy to unit-test; keep route handlers thin.
10. **Keep deployment working.** Every step that adds an env variable must also update `.env.example`, `.env.production.example`, and the env table in `docs/deployment.md`. The CI "docker smoke" job (step S0.7) must stay green on every PR.
11. **TypeORM rules** (they exist because Vitest and the migration bundle use esbuild, which does not emit decorator metadata):
    - Always give an **explicit `type`** in every `@Column(...)`, e.g. `@Column({ type: 'text' })`. Never rely on the TypeScript type being detected.
    - Relations always use the lazy arrow form `@ManyToOne(() => User, ...)` and the property type is wrapped: `Relation<User>` (imported from `typeorm`). This avoids circular-import crashes.
    - Inside `src/server/db/` and `scripts/` use **relative imports only** (no `@/` alias), so the migration bundle builds correctly.
    - `synchronize` is **never** turned on. The schema changes only through migrations.
    - Secret columns (`password_hash`, `encrypted_api_key`, token hashes) are declared with `select: false`, so they are never loaded by accident. Code that really needs them asks for them explicitly.
    - Never write `repo.save({ ...requestBody })`. Build the object field by field (see rule 3).

---

## 4. Folder layout (target)

```
src/
  app/                       # pages and route handlers
    (auth)/login/ register/ forgot-password/ reset-password/
    (app)/chat/[id]/ settings/ memory/ projects/
    api/...
  components/
  lib/                       # client-safe helpers (no secrets, no db)
  server/
    env.ts
    db/ { data-source.ts, client.ts, entities/*.entity.ts (+ index.ts barrel),
          migrations/*.ts (+ index.ts barrel) }
    http/ { api-route.ts, errors.ts, sse.ts }
    auth/ { password.ts, tokens.ts, session.ts, csrf.ts }
    abac/ { types.ts, policy.ts, authorize.ts }
    providers/ { types.ts, registry.ts, openai-compatible.ts }
    models/ { access.ts, catalog.ts }
    keys/ { vault.ts, service.ts }
    chat/ { service.ts, context-builder.ts }
    guests/ { identity.ts }
    tracking/ { record.ts, queries.ts }
    rate-limit/ { limiter.ts }
    memory/   (V2)
    projects/ (V3)
    export/   (V4)
tests/ { helpers/ , e2e/ }
scripts/ { migrate.ts, docker-entrypoint.sh, ... }
docker/ { initdb/, Caddyfile }
ci/ { .env.ci, docker-compose.ci.yml }
docs/ { deployment.md, questions.md, ... }
Dockerfile
docker-compose.yml          # local development (db; the app runs under the "full" profile)
docker-compose.prod.yml     # production
.env.example  .env.production.example
```

---

## 5. Shared patterns (used by many steps)

### 5.1 Error format
Every API error returns JSON `{ "error": { "code": "snake_case_code", "message": "Human readable" } }`.

| HTTP | When | Example code |
|---|---|---|
| 400 | Bad input (Zod failure) | `invalid_request` |
| 401 | Not logged in | `unauthenticated` |
| 403 | Logged in but policy says no (only when existence is not secret) | `forbidden` |
| 404 | Not found **or not yours** (use this for other users' resources, so existence is not leaked) | `not_found` |
| 409 | Conflict (e.g. duplicate email) | `conflict` |
| 429 | Rate limited, include `Retry-After` header | `rate_limited` |
| 502 | Upstream provider failed | `provider_error` |

Create a small `AppError` class: `new AppError(404, 'not_found', 'Chat not found')`. The `apiRoute` wrapper (step A4) converts it to a response. Unknown errors become a generic 500 with no internal details.

### 5.2 SSE event format (chat streaming)
Each event is text, ended by a blank line:
```
event: delta
data: {"text":"Hel"}

event: done
data: {"messageId":"...","usage":{"inputTokens":12,"outputTokens":40}}

event: error
data: {"code":"provider_error","message":"..."}
```
Event names: `meta` (optional, first), `delta`, `done`, `error`. Route handlers must declare:
```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

### 5.3 Test helpers (created in S0.4)
- `tests/helpers/db.ts`: gives each test file a clean database.
- `tests/helpers/factories.ts`: `createUser()`, `createGuest()`, `createChat()` etc. (grows as tables appear).
- `tests/helpers/fake-provider.ts`: a fake `ChatProvider` that streams scripted chunks.

### 5.4 Naming conventions
- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Database tables and columns: `snake_case`. TypeScript: `camelCase` (the `SnakeNamingStrategy` from `typeorm-naming-strategies` converts between them; set table names explicitly with `@Entity({ name: 'chat_sessions' })`).
- Entity files: `<name>.entity.ts`, one class per file, class names singular PascalCase (`ChatSession`). Migration files are generated by TypeORM as `<timestamp>-<Name>.ts`.
- Enums as TypeScript string unions plus a DB CHECK constraint (simpler to migrate than Postgres enums).
- All primary keys are `uuid` (`@PrimaryGeneratedColumn('uuid')`).
- All timestamps are `timestamptz`, default `now()`.

---

### 5.5 TypeORM patterns used throughout

```ts
// Get the connection (initialised once, cached) -- see step S0.2
const ds = await getDataSource();

// Read with a repository; always filter by owner in service code
const chats = await ds.getRepository(ChatSession).find({
  where: { ownerUserId: userId },
  order: { updatedAt: 'DESC' },
  take: 50,
});

// Create: build the object field by field, never spread request bodies
await ds.getRepository(User).insert({ email, passwordHash }); // role comes from the DB default

// Transaction: pass `em` (EntityManager) down so everything joins it
await ds.transaction(async (em) => {
  await em.insert(Message, { sessionId, role: 'user', content });
  await recordUserMessage(em, { /* ... */ });   // tracking (step G1)
});

// Raw SQL: always parameterised ($1, $2, ...). Never concatenate input into SQL.
// For UPDATE ... RETURNING, TypeORM's Postgres driver returns [rows, affectedCount]:
const [rows] = await em.query('UPDATE t SET n = n + 1 WHERE id = $1 RETURNING n', [id]);

// Secret columns are `select: false`; ask for them explicitly when truly needed:
const u = await repo.createQueryBuilder('u').addSelect('u.passwordHash').where('u.email = :e', { e }).getOne();
```

Entity example (explicit column types, lazy relations):

```ts
@Entity({ name: 'chat_sessions' })
@Check('chat_sessions_one_owner', '(owner_user_id IS NULL) <> (owner_guest_id IS NULL)')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', nullable: true }) ownerUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'owner_user_id' }) ownerUser?: Relation<User> | null;
  @Column({ type: 'text' }) title!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
```

---

## 6. Glossary

| Term | Meaning |
|---|---|
| Provider | An LLM backend instance declared in env (e.g. `openrouter`, `local`) with a fixed type and base URL |
| Server key | An API key the operator puts in env for a provider |
| BYOK | "Bring your own key": a user saves their own key for a supported provider |
| Key source | `server` (operator pays) or `user` (BYOK). Always chosen explicitly |
| Included model | A model listed in `ALLOWED_MODELS`, usable via the server key |
| ABAC | Attribute-based access control: decisions from attributes of subject, resource, action, environment |
| Subject | Whoever acts: a user or a guest |
| Chat session | One conversation. (Auth login sessions are called `auth_sessions` in the code to avoid mixing them up.) |
