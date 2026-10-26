# MVP, part 2: C (Your own API keys), D (Model access and catalog), E (Persistent chats)

Read `00-README.md` first.

---

# C. Provider keys (BYOK)

## C1 Key vault (encryption)
**Goal:** encrypt and decrypt API keys safely.
**Needs:** A1

**Instructions**
1. Env (add to `env.ts` and `.env.example`):
   ```env
   KEY_ENCRYPTION_KEYS=1:BASE64_32_BYTES,2:BASE64_32_BYTES
   KEY_ENCRYPTION_CURRENT_VERSION=2
   ```
   Parse into a `Map<number, Buffer>`. Each key must decode to exactly 32 bytes. The current version must exist in the map. Generate one with `openssl rand -base64 32`.
2. `src/server/keys/vault.ts`:
   ```ts
   import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
   export function encrypt(plaintext: string): { payload: string; keyVersion: number } {
     const iv = randomBytes(12);
     const cipher = createCipheriv('aes-256-gcm', keyFor(current), iv);
     const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
     const tag = cipher.getAuthTag();
     return { payload: Buffer.concat([iv, tag, ct]).toString('base64'), keyVersion: current };
   }
   // decrypt(payload, keyVersion): split iv(12) | tag(16) | ct, setAuthTag, decrypt
   ```
3. Add `reencrypt(payload, oldVersion)` for rotation (decrypt with the old key, encrypt with the current).
4. Add a script `scripts/rotate-keys.ts` (`pnpm keys:rotate`) that loops over `user_provider_keys` rows with an old `keyVersion` and updates them.
5. Tests: round trip; two encryptions of the same text differ (random IV); modifying one byte of the payload makes `decrypt` throw; decrypt using an older version still works while that key remains configured; rotation updates the version.

**Watch out:** never reuse an IV with the same key; never log the plaintext or the master key; keep old keys in the env until every row is rotated.

**Done when**
- [ ] All vault tests pass.

**Commit:** `step C1: key vault`

---

## C2 Key service and validation
**Goal:** let a user save, replace, remove and list keys. Keys are validated against the provider first.
**Needs:** C1, S1.3, B2

**Instructions**
1. `src/server/keys/service.ts`:
   - `saveKey(user, providerId, plaintextKey)`:
     1. `authorize(subject, 'create' or 'update', { type: 'providerKey', ownerUserId })`;
     2. check the provider exists in the registry (else 400 `unknown_provider`);
     3. trim the key; reject empty or over 500 chars;
     4. validate by calling `provider.listModels(key)`. `ProviderAuthError` becomes `AppError(400, 'invalid_key', 'The provider rejected this key')`; unavailable becomes 502 and the key is **not** saved;
     5. encrypt and upsert on `(userId, providerId)`; store `last4` and `validationStatus='valid'`, `validatedAt=now`;
     6. invalidate the user's catalog cache for that provider (hook added in D2).
   - `deleteKey(user, providerId)`.
   - `listKeys(user)` returns `[{ providerId, last4, validationStatus, validatedAt }]`. **Never** the key or ciphertext. Use an explicit select of columns.
   - `getDecryptedKey(userId, providerId)`: **internal only**, used by the model access resolver (D1). Not exported through any route.
2. Routes: `GET /api/settings/keys`, `PUT /api/settings/keys/[providerId]` (body `{ apiKey }`, `.strict()`), `DELETE /api/settings/keys/[providerId]`.
3. Optional: `POST /api/settings/keys/[providerId]/revalidate` to retest a saved key.
4. Tests: invalid key not stored; valid key stored encrypted (query the raw row and assert the plaintext does not appear anywhere in it); list never contains the key; replacing updates in place (one row per provider); another user cannot delete your key (404); guests get 401; a log spy proves the key was never logged (spy on `console.*`).

**Done when**
- [ ] All tests pass.

**Commit:** `step C2: key service and validation`

---

## C3 Settings UI for keys
**Goal:** a settings page to manage keys.
**Needs:** C2, A7

**Instructions**
1. Page `/settings` (use `requireUser()`), section "Provider API keys".
2. For each supported provider (from `/api/models` or a new `GET /api/providers` returning id and label only): show status ("No key", or "Key ending in `abcd` · valid · checked 3 min ago"), a password-type input, "Save" and "Remove" buttons.
3. After saving, clear the input. Never show or store the key in client state beyond the input.
4. Show clear errors ("The provider rejected this key").
5. Playwright e2e with a mock provider server (a tiny Node HTTP server started in the test): save valid key, see the suffix; save invalid key, see the error; remove key.

**Done when**
- [ ] e2e passes; inspecting network responses shows no key value.

**Commit:** `step C3: key settings ui`

---

# D. Model access and catalog

## D1 Model access resolver
**Goal:** one function decides which credential (if any) a request may use.
**Needs:** B2, C2

**Instructions**
1. `src/server/models/access.ts`:
   ```ts
   resolveModelAccess(subject, { providerId, modelId, keySource }):
     Promise<{ apiKey?: string }>   // throws AppError on deny
   ```
2. Logic:
   - build the `Environment` (B3);
   - `authorize(subject, 'useModel', { type: 'model', providerId, modelId, keySource })`;
   - if `keySource === 'server'`: return `{ apiKey: providers[providerId].serverApiKey }` (may be undefined for keyless providers);
   - if `keySource === 'user'`: fetch and decrypt the user's key via `getDecryptedKey`, return it.
3. **Never infer `keySource`.** The request must include it. If it is missing, return 400 `key_source_required`.
4. Tests: guest + server model allowed; guest + user source denied; user + server model not in allow-list denied; user + user source + model not in allow-list allowed; user + user source without a key denied; the same model works via both sources when explicitly chosen; provider not supported denied.

**Done when**
- [ ] All tests pass.

**Commit:** `step D1: model access resolver`

---

## D2 Per-user catalog with short cache
**Goal:** list all models a user's own key can access, without leaking between users.
**Needs:** D1, S1.3

**Instructions**
1. `src/server/models/catalog.ts`: `getUserCatalog(userId)`:
   - for each provider where the user has a saved key, call `listModels(userKey)` in parallel with a per-provider timeout (8 s);
   - return `{ [providerId]: { models } | { error: 'auth_failed' | 'unavailable' } }` so one broken provider does not hide the rest;
   - cache each result in memory keyed by **`${userId}:${providerId}`** for 5 minutes (use a `Map` with expiry timestamps; add a max size, e.g. 500 entries, with simple oldest-first eviction).
2. Export `invalidateCatalog(userId, providerId)` and call it from `saveKey` and `deleteKey` (C2).
3. If a provider answers `auth_failed`, update that key's `validationStatus` to `invalid` so settings shows it.
4. Tests: second call within TTL does not hit the provider; after TTL it does (fake clock); user A's cache never serves user B (two users, same provider, different fake model lists); invalidation works; one provider failing still returns the other.

**Watch out:** in a multi-instance deployment an in-memory cache is per instance. That is fine (short TTL, no correctness issue).

**Done when**
- [ ] All tests pass.

**Commit:** `step D2: byok model catalog`

---

## D3 Unified `/api/models`
**Goal:** one endpoint returns both included models and "via your key" models.
**Needs:** D2, S1.5

**Instructions**
1. Response shape:
   ```json
   { "default": {...},
     "included": [ { "providerId", "providerLabel", "models": [ { "modelId", "label?" } ] } ],
     "viaYourKey": [ { "providerId", "providerLabel", "models": [...] } | { "providerId", "error": "..." } ] }
   ```
   Every model entry gets `keySource` implicitly by section (`included` = `server`, `viaYourKey` = `user`).
2. Guests (no user) get `viaYourKey: []`. Use `apiRoute({ auth: 'optional' })`.
3. Tests for three cases: guest, user with no keys, user with a key (fake provider returning 300 models).

**Done when**
- [ ] Tests pass; no secrets in any response.

**Commit:** `step D3: unified models endpoint`

---

## D4 Model picker v2
**Goal:** a picker that copes with hundreds of models and duplicate entries.
**Needs:** D3, S1.10

**Instructions**
1. Replace the `Select` with a searchable combobox (shadcn `Command` + `Popover`).
2. Sections: "Included" (per provider) and "Via your key: <provider>". If the same model appears in both, show both rows with a small badge ("included" / "your key").
3. Search filters by substring across both sections; keep rendering fast with a cap of ~100 visible rows plus "keep typing to narrow".
4. Selection state `{ providerId, modelId, keySource }`; persist the last choice in `localStorage` (wrapped in try/catch), validate it against the current list on load.
5. Show a provider error row ("OpenRouter: key rejected, check Settings") when `viaYourKey` has an error.
6. Optional: favorites stored in `localStorage` for now.
7. Component tests: search narrows; duplicates both appear with different badges; selecting returns the right triple.

**Done when**
- [ ] Tests pass; manual test with 300 fake models is smooth.

**Commit:** `step D4: model picker v2`

---

# E. Persistent chats

## E1 Chat session CRUD
**Goal:** create, list, rename, delete chats; owners only.
**Needs:** B3, A1

**Instructions**
1. `src/server/chat/sessions.ts` with functions that all take a `Subject` and call `authorize`:
   - `createChat(subject, { title? })` sets owner from the subject (user id or guest id). **Never** from the request.
   - `listChats(subject)`: **only that subject's** chats, newest `updatedAt` first, paginated (`limit` 50, cursor on `updatedAt`).
   - `getChat(subject, id)`: load, then `authorize(subject, 'read', {...})`.
   - `renameChat`, `deleteChat`.
2. Routes: `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/[id]` (PATCH body: `{ title }` only, `.strict()`).
3. Tests: user A creating/reading their chat works; user B gets 404 for A's chat on read/patch/delete; guest owns a guest chat; list only returns own chats; PATCH with `ownerUserId` returns 400.

**Done when**
- [ ] All tests pass.

**Commit:** `step E1: chat session crud`

---

## E2 Persisted streaming messages
**Goal:** sending a message stores both sides of the conversation and streams the reply.
**Needs:** E1, D1, S1.6

**Instructions**
1. Route `POST /api/chats/[id]/messages`, body `{ content, providerId, modelId, keySource }` (`.strict()`, content max 100k chars). Then retire the stateless `/api/chat` route (delete it and its tests, move useful tests over).
2. `src/server/chat/service.ts` `sendMessage(subject, chatId, input)` does, in this order:
   1. load the chat; `authorize(subject, 'sendMessage', chatResource)` (includes the guest limit);
   2. `resolveModelAccess(...)` to get the credential;
   3. **in one DB transaction**: insert the user message; (guest) atomically increment the counter (F2); set `chat.currentModel`; commit;
   4. load history (all messages of the chat, ordered), build `ChatMessage[]` via `context-builder.ts` (for now just the history; M5/P6 will add system content here);
   5. stream from the provider; accumulate text;
   6. when finished, insert the assistant message with `model`, `keySource`, `tokenUsage`, `status`;
   7. on abort or error: store the partial text with `status = 'partial' | 'error'` (if there is any text).
   Steps 3 and 6 are where tracking calls will be added in G1. Put a clear `// TRACKING HOOK` comment at both points.
3. Stream to the client as SSE (`meta` with the user message id first, then `delta`s, then `done` with the assistant message id). Handle client disconnect via `request.signal`.
4. `context-builder.ts`: `buildMessages({ history })`, a pure function returning `ChatMessage[]`. Skip messages with `status = 'error'` and empty content.
5. Tests (fake provider): send then reload history; model switch between two messages replays the full history to the new model (assert what the fake provider received); abort stores a partial message; another user's chat returns 404; a model not allowed for this subject returns 404/403 without calling the provider; `keySource` missing returns 400.

**Watch out:** do not hold a DB transaction open while streaming. Commit the user message first, stream, then insert the assistant message in a new short transaction.

**Done when**
- [ ] All tests pass; manual chat, reload the page, history is still there.

**Commit:** `step E2: persisted streaming messages`

---

## E3 Sidebar and routing
**Goal:** a normal chat app layout.
**Needs:** E2, D4

**Instructions**
1. Routes: `/chat` (new chat), `/chat/[id]`. Load the chat and messages in a server component; pass to a client chat component. Return `notFound()` if `getChat` throws 404.
2. Sidebar: list of chats with rename (inline) and delete (confirm dialog), "New chat" button, responsive (collapsible on mobile).
3. First message of a new chat creates the chat (`POST /api/chats`), navigates with `router.replace`, then streams.
4. Auto-title: use the first 60 characters of the first user message. (Model-generated titles are a future improvement.)
5. e2e: create two chats, reload, rename, delete.

**Done when**
- [ ] e2e passes.

**Commit:** `step E3: chat sidebar and routing`

---

## E4 Regenerate and stop with persistence
**Goal:** make stop/regenerate work with stored messages.
**Needs:** E2

**Decision to record in `docs/questions.md` first:** when regenerating, do we **delete** the old assistant message or **keep it hidden** (`supersededBy`)? Simplest MVP choice: delete the old assistant message and its content, then insert the new one. (Tracking counts remain, since tracking is separate from message content.)

**Instructions**
1. Route `POST /api/chats/[id]/regenerate` (same body as send minus `content`). The server deletes the last assistant message (must be last in the chat, else 400), then streams a new reply using history up to the last user message. Authorization is `sendMessage`. For guests, regenerate counts as a message (document this).
2. Stop: already stores a partial message; the UI shows the partial as normal with a small "stopped" marker (`status = 'partial'`).
3. Tests for both flows.

**Done when**
- [ ] Tests pass; manual stop and regenerate work after a page reload.

**Commit:** `step E4: regenerate and stop persistence`
