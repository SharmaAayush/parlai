# MVP, part 3: F (Guests), G (Tracking), H (Hardening)

Read `00-README.md` first.

---

# F. Guests

## F1 Guest identity
**Goal:** recognise anonymous visitors without accounts.
**Needs:** A1, A5

**Principle:** a fingerprint alone is spoofable and can collide, so identity is a combination: a signed guest cookie (primary), plus fingerprint hash and IP-based limits as secondary signals.

**Instructions**
1. Env: `GUEST_COOKIE_SECRET` (random 32+ chars), `GUEST_MAX_MESSAGES` (default 10), `GUEST_IP_MAX_MESSAGES_PER_DAY` (default 50).
2. `src/server/guests/identity.ts`:
   - cookie `parlai_guest` containing `<cookieId>.<hmac>` where `hmac = HMAC-SHA256(secret, cookieId)` (base64url). `HttpOnly`, `SameSite=Lax`, `Secure` in production, 1 year. Verify with `timingSafeEqual`.
   - `resolveGuest({ cookie, fingerprint, ip })`, in this order:
     1. valid cookie that matches a `guest_identities` row: use it; if a fingerprint was sent and the row has none, store its hash;
     2. otherwise, if a fingerprint hash matches **an existing** row (user cleared cookies): reuse that row and issue a fresh cookie for it;
     3. otherwise create a new guest row and cookie.
   - Fingerprint comes from a request header `x-parlai-fp` set by the client (hash it with SHA-256 server-side before storing; never store the raw value). Hash IPs the same way.
   - Document the trade-off: two different people with identical fingerprints (rare) share a limit.
3. Client: `pnpm add @fingerprintjs/fingerprintjs`; load it lazily once (`FingerprintJS.load()` then `get()`), cache the visitor id in memory, add it to guest requests.
4. Add `guest` to `apiRoute`'s context when `auth: 'optional'` and there is no user.
5. Tests: new visitor gets a row and cookie; tampered cookie is rejected and treated as new (unless the fingerprint matches); cookie cleared + same fingerprint resolves to the same row; two different fingerprints are different guests.

**Done when**
- [ ] Tests pass.

**Commit:** `step F1: guest identity`

---

## F2 Guest limits
**Goal:** enforce `GUEST_MAX_MESSAGES` safely, even with parallel requests.
**Needs:** F1, B2, E2

**Instructions**
1. Counting: in the `sendMessage` transaction (E2 step 3) run:
   ```sql
   UPDATE guest_identities
   SET message_count = message_count + 1
   WHERE id = $1 AND message_count < $2
   RETURNING message_count;
   ```
   If no row is returned, abort with `AppError(403, 'guest_limit_reached', ...)`. This is atomic, so ten parallel requests cannot exceed the limit. Run it with `em.query(sql, [guestId, limit])`; for `UPDATE ... RETURNING` the Postgres driver returns `[rows, affectedCount]`, so check `rows.length === 0`.
2. Still run `authorize(..., 'sendMessage')` first so the policy stays the single source of truth (the SQL is the race-proof backstop).
3. Add a per-IP daily cap with the rate limiter (key `guest-ip:<hash>`, window 24 h, `GUEST_IP_MAX_MESSAGES_PER_DAY`).
4. Guests may only use `keySource: 'server'` models in `ALLOWED_MODELS` (already enforced by the policy; add a route-level test).
5. Tests: limit exactly reached; **concurrency test** firing 20 simultaneous sends with limit 10 yields exactly 10 successes; cookie cleared + same fingerprint does not reset the count; IP cap works; guest cannot use BYOK.

**Decision to record:** lifetime limit (default) vs daily reset. If the operator wants a daily reset, add `GUEST_LIMIT_WINDOW=lifetime|daily` later.

**Done when**
- [ ] All tests pass, including the concurrency test.

**Commit:** `step F2: guest limits`

---

## F3 Guest UI and migration to account
**Goal:** guests see their remaining messages, and chats move to the new account on sign-up or login.
**Needs:** F2, A7

**Instructions**
1. Show "N messages left. Sign up to continue" in the composer area for guests; when the limit is hit, disable the composer and show a sign-up call to action.
2. `migrateGuestChats(guestId, userId)` in one transaction: `UPDATE chat_sessions SET owner_user_id = $user, owner_guest_id = NULL WHERE owner_guest_id = $guest` (the CHECK constraint stays satisfied because both changes happen in one statement). Messages and events follow automatically since they reference the session.
3. Call it from **register** and **login** when a valid guest cookie is present, then clear the guest cookie. (Decide for login: migrate only if the guest has at least one chat; document it.)
4. Tests: after registering, the guest's chats belong to the user; the old guest identity cannot read them (the cookie is cleared; a stale cookie finds no chats); chats of other guests are untouched.
5. e2e: chat as guest, sign up, chats are in the sidebar.

**Done when**
- [ ] Tests and e2e pass.

**Commit:** `step F3: guest ui and chat migration`

---

# G. Session tracking

## G1 Tracking service
**Goal:** record usage **metadata** (never message content) as part of normal message flow.
**Needs:** E2

**Instructions**
1. `src/server/tracking/record.ts` with functions that take a TypeORM `EntityManager` (`em`, from `dataSource.transaction(async (em) => { ... })`) so they join the caller's transaction:
   - `recordSessionCreated(em, sessionId)` inserts an event `session_created`.
   - `recordUserMessage(em, { sessionId, model, keySource, messageIndex, previousModel })`:
     - inserts a `message_sent` event;
     - if `previousModel` exists and differs from `model`, inserts a `model_switched` event (`fromModel`, `toModel`, `messageIndex`);
     - upserts `session_model_usage` for `(sessionId, model, keySource)`: `userMessages + 1`, update `lastUsed`, set `firstUsed` on insert.
   - `recordAgentMessage(em, { sessionId, model, keySource, usage })`: upsert `agentMessages + 1`, add `inputTokens` and `outputTokens` when present.
   - `recordError(em, { sessionId, model, keySource, code })`: `error` event plus `errors + 1`.
2. Wire into E2 at the two `TRACKING HOOK` comments: `recordUserMessage` in the same transaction that inserts the user message; `recordAgentMessage` in the same transaction that inserts the assistant message; `recordError` on failures (also when no assistant text was produced).
3. Create the first-message timestamp: store `firstMessageAt`/`lastActivityAt` by adding two columns to `chat_sessions` (migration), updated in the same transactions.
4. **Content separation:** these tables contain no message text. Add a test that scans the columns of `session_events` and `session_model_usage` and asserts there is no `content` column.
5. Tests with a scripted conversation: model A (server) then model B (user key): expect two usage rows, one `model_switched` event with the right `messageIndex`, counts of user and agent messages per model, tokens summed, an error counted.

**Watch out:** the transaction rule: if the message insert fails, tracking must roll back too (test it by forcing a failure). Increment counters **in SQL**, not read-then-write: use a parameterised `em.query` with `INSERT ... ON CONFLICT (session_id, model, key_source) DO UPDATE SET user_messages = session_model_usage.user_messages + 1, last_used = now()`, so two parallel messages cannot lose an update.

**Done when**
- [ ] All tests pass.

**Commit:** `step G1: session tracking`

---

## G2 Usage metadata query (admin only)
**Goal:** a server function the future dashboard will use. No UI yet.
**Needs:** G1, B2

**Instructions**
1. `src/server/tracking/queries.ts`: `getUsageSummary(subject)` calls `authorize(subject, 'readUsageMetadata', { type: 'usageMetadata' })`, then returns aggregates grouped by model and key source: sessions, user messages, agent messages, tokens, errors. No chat content, no user emails.
2. Optional route `GET /api/admin/usage` using the same function (guarded the same way).
3. Tests: admin allowed; user/guest denied; **admin still cannot read another user's chat** (E1 test, but with an admin subject); results contain no `content`.

**Done when**
- [ ] All tests pass.

**Commit:** `step G2: admin usage query`

---

# H. MVP hardening

## H1 Authorization test matrix and mass-assignment tests
**Goal:** prove the security promises of the spec.
**Needs:** all of A to G

**Instructions**
1. Create `tests/security/authz-matrix.test.ts`. Seed: users Alice, Bob, admin Carol; guest Gus. Each has a chat and (for users) a saved key and settings.
2. For every route (use the route list from the audit test) assert the matrix: owner allowed; other user gets 404 (never 200, never data); admin gets 404 for others' chats and keys; guest cannot reach user resources.
3. Mass assignment: for every write route, send extra fields (`role: 'admin'`, `ownerUserId`, `ownerGuestId`, `userId`, `keySource`, `id`) and assert 400 (strict schemas) and that no DB row changed.
4. Add one test per Success Criterion that concerns auth (spec section 8) with the criterion text in the test name.

**Done when**
- [ ] All tests pass; list of covered criteria appended to `docs/acceptance.md`.

**Commit:** `step H1: authz matrix tests`

---

## H2 Security pass
**Goal:** headers, cookies, logging, dependency checks.
**Needs:** H1

**Instructions**
1. Add security headers in `next.config.ts` `headers()`: `Content-Security-Policy` (start with `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'` plus nonce handling as Next requires, test the app still works), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` minimal.
2. Write a logging helper `logger.ts` with a redaction list (`apiKey`, `authorization`, `password`, `token`, `cookie`) applied to all logged objects. Replace direct `console.*` calls. Test the redaction.
3. Add `pnpm audit --prod` to CI (allow failure initially, then fix).
4. Create `docs/security.md`: a checklist mapping each item in the spec's "Security practices" to where it is implemented and the test proving it.

**Done when**
- [ ] App works under the CSP; redaction test passes; checklist complete.

**Commit:** `step H2: security headers logging audit`

---

## H3 Admin promotion (manual)
**Goal:** a safe, documented way to create an admin; no API path.
**Needs:** A1

**Instructions**
1. `docs/admin.md` with the SQL: `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`
2. Script `pnpm admin:promote <email>` (`scripts/promote-admin.ts`) that does the same and prints the result. It refuses to run if `NODE_ENV` is not set to something intentional? (Keep it simple: require `--yes` flag.)
3. Test: scan all route files and assert none of them writes to `users.role` (grep-style test), plus an API-level test that `PATCH`-style routes ignore/reject `role`.

**Done when**
- [ ] Tests pass; docs written.

**Commit:** `step H3: admin promotion`

---

## H4 Rate limits on the server key
**Goal:** stop one account from draining the operator's key.
**Needs:** E2, A5

**Instructions**
1. Env: `SERVER_KEY_MESSAGES_PER_HOUR` (default 60) and `SERVER_KEY_MESSAGES_PER_DAY` (default 300) per user.
2. In `sendMessage` (before streaming) when `keySource === 'server'` and the subject is a user: `limiter.hit('srv:'+userId+':h', ...)` and `':d'`. Return 429 with `Retry-After` and code `server_key_limit`.
3. BYOK (`keySource === 'user'`) uses a lighter protective limit only (e.g. 600/hour) to protect your server, not your wallet.
4. Surface the limit in the UI as a friendly message suggesting adding their own key.
5. Tests: server-key limit triggers; BYOK is unaffected by the server-key limit; limits are per user.

**Done when**
- [ ] Tests pass.

**Commit:** `step H4: server key rate limits`
