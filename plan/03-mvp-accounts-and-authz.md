# MVP, part 1: A (Accounts) and B (ABAC authorization)

Read `00-README.md` first. These sections build the foundation that all later user data depends on, so take your time.

---

# A. Accounts

## A1 Core database schema (TypeORM entities and first migration)
**Goal:** create all MVP tables as TypeORM entities plus one reviewed migration.
**Needs:** S0.4

**Instructions**
1. Create one file per entity in `src/server/db/entities/` named `<name>.entity.ts`. Follow README rule 11 (explicit column types, lazy relations with `Relation<>`, relative imports, secret columns `select: false`). Register every entity in `entities/index.ts`.
   Entities and key columns (full list in spec section 5):
   - `User` (`users`): `id` (uuid), `email` (text, unique, **stored lowercase**), `passwordHash` (text, `select: false`), `emailVerified` (boolean, default false), `role` (text, default `'user'`), `createdAt`.
     `@Check('users_role_check', "role IN ('user','admin')")` and `@Check('users_email_lower', 'email = lower(email)')`.
     (Memory columns are added later in M1.)
   - `AuthSession` (`auth_sessions`): `id`, `userId` (FK to users, cascade), `tokenHash` (text, unique, `select: false`), `expiresAt`, `createdAt`, `lastUsedAt`.
   - `GuestIdentity` (`guest_identities`): `id`, `cookieId` (unique), `fingerprintHash` (nullable, `@Index`), `ipHash` (nullable), `messageCount` (int, default 0), `firstSeen`.
   - `UserProviderKey` (`user_provider_keys`): `id`, `userId` (FK cascade), `providerId` (text), `encryptedApiKey` (text, `select: false`), `keyVersion` (int), `last4` (text), `validationStatus` (`valid | invalid | unknown`), `validatedAt`, `createdAt`. `@Unique(['userId', 'providerId'])`.
   - `ChatSession` (`chat_sessions`): `id`, `ownerUserId` (nullable FK cascade), `ownerGuestId` (nullable FK cascade), `title`, `currentModel` (nullable), `createdAt`, `updatedAt` (`@UpdateDateColumn`). `@Check('chat_sessions_one_owner', '(owner_user_id IS NULL) <> (owner_guest_id IS NULL)')`.
     (`projectId`, memory overrides come later.)
   - `Message` (`messages`): `id`, `sessionId` (FK cascade), `role` (`user|assistant`), `content` (text), `model` (nullable; `providerId:modelId`), `keySource` (`server|user`, nullable for user messages), `tokenUsage` (jsonb, nullable), `status` (`complete | partial | error`, default `complete`), `createdAt`. `@Index(['sessionId', 'createdAt'])`.
   - `SessionEvent` (`session_events`): `id`, `sessionId` (FK cascade), `type` (CHECK in `session_created|message_sent|model_switched|error`), `fromModel`, `toModel`, `messageIndex`, `metadata` (jsonb), `createdAt`.
   - `SessionModelUsage` (`session_model_usage`): composite primary key `(sessionId, model, keySource)` using three `@PrimaryColumn`s, plus `userMessages`, `agentMessages`, `inputTokens`, `outputTokens`, `errors` (all int default 0), `firstUsed`, `lastUsed`.
   - `RateLimit` (`rate_limits`): composite PK `(key, windowStart)`, `count` (int).
2. Column example showing every rule at once:
   ```ts
   @Entity({ name: 'users' })
   @Check('users_role_check', "role IN ('user','admin')")
   @Check('users_email_lower', 'email = lower(email)')
   export class User {
     @PrimaryGeneratedColumn('uuid') id!: string;
     @Column({ type: 'text', unique: true }) email!: string;
     @Column({ type: 'text', select: false }) passwordHash!: string;
     @Column({ type: 'boolean', default: false }) emailVerified!: boolean;
     @Column({ type: 'text', default: 'user' }) role!: 'user' | 'admin';
     @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
   }
   ```
   Names in `@Check` expressions are **raw SQL**, so use the real snake_case column names there.
3. Generate the migration: `pnpm db:generate src/server/db/migrations/CoreSchema`. **Open the generated file and read the SQL.** Confirm it contains the CHECK constraints, defaults, unique constraints and cascade rules. Register the migration class in `migrations/index.ts` (the barrel test fails if you forget). Run `pnpm db:migrate`.
4. Run `pnpm db:generate src/server/db/migrations/Check` again: it must say **"No changes"**. If it proposes changes, your entities and migration disagree; fix that before moving on.
5. Write `tests/db/constraints.test.ts`:
   - inserting a user with `role: 'superuser'` fails; inserting a user without a role gives `'user'`; an email with capital letters fails the lowercase check;
   - a chat with both owners fails; with neither fails; with one succeeds;
   - deleting a user cascades to their keys, chats and messages;
   - loading a user with `findOne` does **not** include `passwordHash` (the `select: false` rule).
6. Add factories `createUser`, `createGuest`, `createChat` in `tests/helpers/factories.ts`.
7. Run `pnpm test` and confirm the CI `docker-smoke` job still passes (it now runs this migration inside the container).

**Watch out**
- Forgetting `type` on a `@Column` works in your editor but breaks in tests and in the Docker migration bundle (no decorator metadata there).
- `ownerUserId` and the relation property are two views of the same column. Declare the plain `@Column({ type: 'uuid', nullable: true }) ownerUserId` **and** a `@ManyToOne` with `@JoinColumn({ name: 'owner_user_id' })`, so the id is easy to read and write.
- Never edit a migration that has been merged. Write a new one.

**Done when**
- [ ] Migration applies on a fresh DB; the "no changes" check is clean; constraint tests pass; CI is green.

**Commit:** `step A1: core schema`

---

## A2 Password hashing and registration
**Goal:** users can sign up. Passwords are hashed with Argon2id.
**Needs:** A1, S1.2 (for `AppError`)

**Instructions**
1. `pnpm add @node-rs/argon2`.
2. `src/server/auth/password.ts`:
   ```ts
   import { hash, verify } from '@node-rs/argon2';
   const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP minimum for Argon2id
   export const hashPassword = (pw: string) => hash(pw, opts);
   export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw);
   ```
   Add a `validatePasswordStrength(pw)`: length 10 to 200, not equal to the email. Keep rules simple.
3. Create `src/server/auth/registration.ts` with `registerUser({ email, password })`:
   - normalise email: `trim().toLowerCase()`;
   - validate with Zod (`email`, `password` only);
   - hash the password, insert the user. **Do not pass `role`**: the DB default applies;
   - on unique violation return `AppError(409, 'conflict', 'Could not create account')` (generic wording).
4. Create `src/app/api/auth/register/route.ts` (`POST`). The Zod schema uses `.strict()` so unknown keys such as `role` are **rejected** with 400.
5. Tests: user is created with role `user`; `{ ..., role: 'admin' }` returns 400 and nothing is created; duplicate email (different casing) returns 409; stored hash starts with `$argon2id$`; the response body has no `passwordHash`.

**Watch out:** do not log the request body. Do not reveal in the error whether the email exists beyond the generic conflict message (full enumeration protection is not required but avoid extra hints).

**Done when**
- [ ] All tests pass.

**Commit:** `step A2: registration with argon2id`

---

## A3 Login, logout, and session cookies
**Goal:** log in, stay logged in, log out.
**Needs:** A2

**Design:** the cookie holds a random token. The database holds only its SHA-256 hash, so a database leak does not leak working sessions.

**Instructions**
1. `src/server/auth/tokens.ts`: `generateToken()` = `crypto.randomBytes(32).toString('base64url')`; `hashToken(t)` = SHA-256 hex.
2. `src/server/auth/session.ts`:
   - `createAuthSession(userId)`: insert hash with `expiresAt = now + 30 days`; return the raw token;
   - `getUserFromToken(token)`: look up by hash, ensure not expired, update `lastUsedAt` and extend `expiresAt` (sliding) at most once per hour to avoid a write on every request; return the user (id, email, role, emailVerified) or null;
   - `destroyAuthSession(token)`, `destroyAllSessionsForUser(userId)`.
3. Cookie helpers using `await cookies()`: name `parlai_session`; options `httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 days`.
4. `getCurrentUser()`: reads the cookie, returns user or null. Wrap with React `cache()` for use in server components.
5. `POST /api/auth/login`: body `{ email, password }`. Look up user; if none, still run `verifyPassword` against a precomputed dummy hash (so timing does not reveal whether the email exists). On failure return a generic 401 `invalid_credentials`. On success create the session and set the cookie. (Guest-chat migration is added in F3.)
6. `POST /api/auth/logout`: delete the session row and cookie.
7. `GET /api/auth/me`: returns `{ user: { id, email, role } }` or `{ user: null }`.
8. Tests: login success sets a cookie; wrong password and unknown email give identical 401 responses; expired session is rejected; logout invalidates the token; token in DB is never the raw value.

**Watch out:** in route handlers you can set cookies with `(await cookies()).set(...)`. In tests, mock `next/headers` with a tiny in-memory cookie jar (create a helper).

**Done when**
- [ ] Tests pass; manually log in and see the `HttpOnly` cookie in devtools.

**Commit:** `step A3: login logout sessions`

---

## A4 The `apiRoute` wrapper and CSRF protection
**Goal:** one consistent way to write route handlers: method checks, CSRF, auth context, Zod parsing, error mapping.
**Needs:** A3

**Instructions**
1. `src/server/auth/csrf.ts`: `assertSameOrigin(request)`. For methods other than GET/HEAD/OPTIONS: read `Origin` (fall back to `Referer`); compare its origin to `new URL(env.APP_URL).origin`; if missing or different throw `AppError(403, 'csrf', ...)`. Because cookies are also `SameSite=Lax`, this gives two layers.
2. `src/server/http/api-route.ts`:
   ```ts
   export function apiRoute<B, Q>(opts: {
     auth?: 'required' | 'optional' | 'none';   // 'optional' allows guests
     body?: z.ZodType<B>; query?: z.ZodType<Q>;
   }, handler: (ctx: { req: Request; user: AuthUser | null; body: B; query: Q;
                      params: Record<string,string> }) => Promise<Response | object>)
   ```
   Steps inside: CSRF check, resolve user, check `auth` mode (401 if required and missing), parse body/query with Zod (400 on failure with a friendly message), run the handler, convert a returned plain object to `Response.json`, and catch errors: `AppError` becomes its status and JSON error format, anything else is logged (without bodies/headers) and returned as generic 500.
3. Refactor existing routes (`/api/auth/*`, `/api/models`, `/api/chat`) to use it. (`/api/health` stays public and unwrapped.)
4. Maintain a small allow-list file `src/server/http/public-routes.ts` of routes that are deliberately unauthenticated (health, register, login, models, etc.). It is used by the audit test in B3.
5. Tests: cross-origin POST returns 403; same-origin POST passes; invalid body returns 400 with `invalid_request`; an unexpected throw returns 500 without the message; `auth: 'required'` returns 401.

**Done when**
- [ ] All existing tests still pass after the refactor; new tests pass.

**Commit:** `step A4: api route wrapper and csrf`

---

## A5 Rate limiting
**Goal:** slow down brute force and abuse.
**Needs:** A4

**Instructions**
1. Define an interface so the backing store can change later:
   ```ts
   interface RateLimiter { hit(key: string, limit: number, windowSec: number):
     Promise<{ allowed: boolean; retryAfterSec: number }> }
   ```
2. Implement `PostgresRateLimiter` using the `rateLimits` table. Fixed window: `windowStart = floor(now / window) * window`. Use one atomic upsert:
   ```sql
   INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
   ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
   RETURNING count;
   ```
   `allowed = count <= limit`.
3. Add a cleanup function deleting windows older than 1 day (call it opportunistically, e.g. 1% of requests, or via a later scheduled job).
4. Add an option to `apiRoute`: `rateLimit: { name, limit, windowSec, by: 'ip' | 'ip+email' }`. Get the client IP from `x-forwarded-for` (first entry) only when env `TRUST_PROXY=true`; otherwise use a fixed key "unknown" and document that reverse proxy config is required. Hash IPs before using them as keys.
5. Apply: login 10 per 15 min per IP and 5 per 15 min per (IP+email); register 5 per hour per IP; password reset 5 per hour per IP.
6. On limit exceeded respond 429 with `Retry-After`.
7. Tests with a fake clock (inject a `now()` function).

**Done when**
- [ ] Eleventh login attempt returns 429 with `Retry-After`; window reset test passes.

**Commit:** `step A5: rate limiting`

---

## A6 Password reset and email verification (optional SMTP)
**Goal:** reset passwords and verify emails when the operator configures SMTP; app works fine without it.
**Needs:** A3, A5

**Instructions**
1. Env: optional `SMTP_URL` (e.g. `smtp://user:pass@host:587`) and `MAIL_FROM`. `env.mailEnabled` is true only when both exist.
2. Table `emailTokens`: `id`, `userId` (FK cascade), `purpose` (`reset|verify`), `tokenHash`, `expiresAt`, `usedAt`. Migration plus test.
3. `src/server/mail/mailer.ts`: `sendMail({ to, subject, text })` with Nodemailer. In tests, replace with an in-memory outbox.
4. Endpoints:
   - `POST /api/auth/password-reset/request` `{ email }`: always return 200 with the same message; if the user exists, create a token (1 hour expiry) and email a link `APP_URL/reset-password?token=...`;
   - `POST /api/auth/password-reset/confirm` `{ token, newPassword }`: validate, mark token used (single use, in a transaction), update the hash, **destroy all the user's auth sessions**;
   - `POST /api/auth/verify/request` (logged in) and `POST /api/auth/verify/confirm`: sets `emailVerified = true`.
5. If `mailEnabled` is false, these endpoints return 404 `feature_disabled`, and the UI hides the links.
6. Tests: token works once; expired token fails; unknown email gives the same response as a known one; sessions are destroyed after reset; behaviour when mail is disabled.

**Watch out:** only store token hashes; never log a reset link in production.

**Done when**
- [ ] All tests pass with the in-memory outbox; the app still starts with no SMTP configured.

**Commit:** `step A6: password reset and verification`

---

## A7 Auth UI
**Goal:** pages for sign-up, login, logout, and reset.
**Needs:** A3, A6

**Instructions**
1. Pages: `/login`, `/register`, `/forgot-password`, `/reset-password`. Forms with shadcn `Input`, `Button`, inline error messages, disabled submit while pending.
2. Header user menu: shows email, "Settings", "Log out"; shows "Sign in" for guests.
3. `src/app/(app)/layout.tsx` calls `getCurrentUser()` and passes the user to the header. (Guests are allowed in the app; individual pages like Settings require login.)
4. Add a `requireUser()` server helper that redirects to `/login` when there is no user, used by Settings/Memory/Projects pages.
5. Playwright e2e (`pnpm add -D @playwright/test`): register, log out, log in again, see the email in the header.

**Done when**
- [ ] e2e passes.

**Commit:** `step A7: auth ui`

---

# B. ABAC authorization

## B1 Attribute types
**Goal:** model subjects, resources, actions, and environment in TypeScript.
**Needs:** A3

**Instructions**
1. Create `src/server/abac/types.ts`:
   ```ts
   export type Subject =
     | { kind: 'user'; userId: string; role: 'user' | 'admin'; emailVerified: boolean }
     | { kind: 'guest'; guestId: string };

   export type Action = 'read' | 'create' | 'update' | 'delete'
     | 'sendMessage' | 'useModel' | 'readUsageMetadata';

   export type Resource =
     | { type: 'chatSession'; ownerUserId: string | null; ownerGuestId: string | null; messageCount: number }
     | { type: 'providerKey'; ownerUserId: string }
     | { type: 'userSettings'; ownerUserId: string }
     | { type: 'usageMetadata' }
     | { type: 'model'; providerId: string; modelId: string; keySource: 'server' | 'user' };

   export interface Environment {
     guestMessageCount?: number;   // for guest subjects
     guestMaxMessages: number;
     allowedModels: ReadonlySet<string>;      // "providerId:modelId"
     serverAccessProviders: ReadonlySet<string>; // providers with a server key or keyless
     userKeyProviders: ReadonlySet<string>;   // providers the subject has saved a key for
   }
   export type Decision = { allow: true } | { allow: false; reason: string };
   ```
2. Add to later steps: memory and project resources are added in M4 and P5.

**Done when**
- [ ] Types compile and are exported from `src/server/abac/index.ts`.

**Commit:** `step B1: abac types`

---

## B2 The policy function
**Goal:** one pure function that answers "may this subject do this?".
**Needs:** B1

**Instructions**
1. `src/server/abac/policy.ts`: `export function can(subject, action, resource, env): Decision`. It must be **pure** (no database, no `Date`), **deny by default**, and every `deny` carries a `reason` string.
2. Implement these rules with a `switch (resource.type)`:
   - **chatSession**: `read | update | delete | sendMessage`: allow only when the subject owns it (`subject.kind === 'user' && resource.ownerUserId === subject.userId`, or guest equivalent). `create`: allow for any subject. For `sendMessage` by a **guest**, additionally require `env.guestMessageCount < env.guestMaxMessages`.
   - **providerKey** and **userSettings**: owner user only. Action `read` on `providerKey` is **always denied** (key values are never readable). Allowed actions: `create`, `update` (replace), `delete`. Guests: deny.
   - **model** with `useModel`:
     - `keySource: 'server'`: allow when the model is in `allowedModels` **and** its provider is in `serverAccessProviders`;
     - `keySource: 'user'`: allow only for a **user** subject whose `userKeyProviders` includes the provider (guests: deny). Do **not** check `allowedModels`.
   - **usageMetadata** `readUsageMetadata`: allow only if `subject.kind === 'user' && subject.role === 'admin'`.
   - Everything else: deny.
3. **Critical admin rule:** no branch may allow something because `role === 'admin'` except `usageMetadata`. Add a comment saying so.
4. Write table-driven tests (`policy.test.ts`) with at least these cases:
   - owner vs non-owner for each of `read/update/delete/sendMessage` on chats;
   - **admin vs another user's chat: denied**;
   - guest under/at the message limit; guest + non-included model;
   - user with server key model; user with only a BYOK key using a model **not** in `ALLOWED_MODELS` (allowed); user using a `user` key source without a saved key (denied);
   - `read` on providerKey: denied for the owner too;
   - `readUsageMetadata`: admin allowed, user denied, guest denied.

**Watch out:** the reason string is for logs and tests, not for showing to users verbatim.

**Done when**
- [ ] All table tests pass; coverage of `policy.ts` is 100% lines.

**Commit:** `step B2: abac policy function`

---

## B3 Enforcement helpers and route audit
**Goal:** make it hard to forget authorization.
**Needs:** B2, A4

**Instructions**
1. `src/server/abac/authorize.ts`:
   - `getSubject(user, guest)` builds a `Subject`;
   - `buildEnvironment(subject)` loads the needed attributes (user's key providers from the DB; guest message count; env lists);
   - `authorize(subject, action, resource)`: calls `can`; on deny throws `AppError(404, 'not_found')` for resources owned by someone else (do not leak existence), and `403` for rules like guest limit reached (use code `guest_limit_reached`, so the UI can respond).
2. Create a Vitest test `tests/audit/routes.test.ts` that walks `src/app/api/**/route.ts`, and for each file asserts: it uses `apiRoute`, **and** it either calls `authorize(` or appears in `public-routes.ts` (the allow-list with a comment per route explaining why). This makes a forgotten check fail CI.
3. Update existing routes to comply.

**Done when**
- [ ] The audit test passes; temporarily adding an unprotected route makes it fail (verify, then remove it).

**Commit:** `step B3: authorization enforcement and audit test`
