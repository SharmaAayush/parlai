# Phase 1: Draft

Read `00-README.md` first (rules, error format, SSE format, conventions). Phase 0 (`01-phase0-setup-ci-docker.md`) must be finished: you need the database, tests, CI and the Docker image in place.

---

# Phase 1: Draft (foundation)

Goal: a streaming chat with a model picker driven by env. Conversations live in browser memory for now. Persistence arrives in MVP E.

## S1.1 Parse provider config from env
**Goal:** read supported providers, allowed models and defaults, and validate them at startup.
**Needs:** S0.3

**Env variables (see spec section 2.2)**
```env
SUPPORTED_PROVIDERS=openrouter,local
PROVIDER_OPENROUTER_LABEL=OpenRouter
PROVIDER_OPENROUTER_TYPE=openai-compatible
PROVIDER_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
PROVIDER_OPENROUTER_API_KEY=sk-...
PROVIDER_LOCAL_LABEL=Local (Ollama)
PROVIDER_LOCAL_TYPE=openai-compatible
PROVIDER_LOCAL_BASE_URL=http://localhost:11434/v1
PROVIDER_LOCAL_REQUIRES_KEY=false
ALLOWED_MODELS=openrouter:vendor/model-a,local:llama3.1:8b
DEFAULT_PROVIDER=openrouter
DEFAULT_MODEL=vendor/model-a
```

**Instructions**
1. Write a pure helper `providerEnvPrefix(id)`: uppercases, replaces non-alphanumerics with `_`, returns `PROVIDER_<ID>_`. Test: `my-prov` becomes `PROVIDER_MY_PROV_`.
2. Write `parseModelRef(s)`: splits on the **first** colon; throws if there is no colon or an empty side. Test with `local:llama3.1:8b` (provider `local`, model `llama3.1:8b`).
3. Create `src/server/providers/config.ts` exporting `type ProviderConfig = { id; label; type: 'openai-compatible'; baseUrl; serverApiKey?: string; requiresKey: boolean }` and `loadProviderConfig(source)` which:
   - splits `SUPPORTED_PROVIDERS` by comma, trims, drops empties, rejects duplicates;
   - for each id reads label (default: id), type (must be `openai-compatible` for now), base URL (valid `http(s)` URL, strip trailing slash), optional API key, `REQUIRES_KEY` (default `true`);
   - parses `ALLOWED_MODELS` into `{providerId, modelId}[]` and checks each provider is supported;
   - determines "server access" for a provider: has a `serverApiKey`, **or** `requiresKey === false`. Each allowed model's provider must have server access;
   - validates `DEFAULT_PROVIDER` and `DEFAULT_MODEL` together form an entry in `ALLOWED_MODELS`.
4. Collect **all** errors and throw one error listing them (not just the first).
5. Call it from `env.ts` so startup fails fast. Export `providers`, `allowedModels`, `defaultModel` from `env`.
6. Tests: valid config; unknown provider in `ALLOWED_MODELS`; default not allowed; invalid base URL; a model whose provider has no server access; duplicate provider ids.

**Watch out:** `serverApiKey` must never be included in anything sent to the client. Later, create a separate `toPublicProvider()` that drops it.

**Done when**
- [ ] All tests above pass.
- [ ] Starting the app with a bad `DEFAULT_MODEL` fails with a readable message.

**Commit:** `step S1.1: provider config from env`

---

## S1.2 Provider types and registry
**Goal:** define the interface everything else uses to talk to LLMs.
**Needs:** S1.1

**Instructions**
1. Create `src/server/providers/types.ts`:
   ```ts
   export type Role = 'system' | 'user' | 'assistant';
   export interface ChatMessage { role: Role; content: string }
   export interface ModelInfo { id: string; label?: string; contextLength?: number }
   export interface ChatRequest { model: string; messages: ChatMessage[]; signal?: AbortSignal }
   export type ChatChunk =
     | { type: 'text_delta'; text: string }
     | { type: 'usage'; inputTokens?: number; outputTokens?: number }
     | { type: 'finish'; reason: string }
     | { type: 'error'; code: string; message: string };
   export interface ChatProvider {
     id: string;
     listModels(apiKey?: string, signal?: AbortSignal): Promise<ModelInfo[]>;
     streamChat(req: ChatRequest, apiKey?: string): AsyncIterable<ChatChunk>;
   }
   ```
   (`req.model` is the provider's own model id, not `providerId:modelId`.)
2. Create `src/server/providers/registry.ts` with `createRegistry(configs, adapterFactories)` returning `{ get(id): ChatProvider; has(id): boolean }`. `get` throws `AppError(400, 'unknown_provider')` for unknown ids. Adapter factories are keyed by `type`, so adding a new adapter type later is one new entry.
3. Create `src/server/http/errors.ts` with the `AppError` class (status, code, message) now if it does not exist.
4. Tests with a fake adapter: `get` returns it, unknown id throws.

**Done when**
- [ ] Code compiles and the registry tests pass.
- [ ] No file outside `providers/` imports anything OpenAI-specific (none exist yet).

**Commit:** `step S1.2: provider interface and registry`

---

## S1.3 OpenAI-compatible adapter: listModels
**Goal:** fetch the list of models from any OpenAI-compatible endpoint.
**Needs:** S1.2

**Instructions**
1. `pnpm add -D msw` (or use `undici`'s `MockAgent`). Create a small helper for mocking `fetch` in tests.
2. Create `src/server/providers/openai-compatible.ts` exporting `createOpenAICompatible(config): ChatProvider`.
3. Implement `listModels(apiKey)`:
   - `GET ${baseUrl}/models`, header `Authorization: Bearer ${apiKey}` only when a key is provided;
   - timeout 10 seconds via `AbortSignal.timeout(10_000)` (combine with the caller's signal using `AbortSignal.any`);
   - parse the body with Zod: `{ data: [{ id: string, name?: string, context_length?: number }] }`; ignore unknown fields;
   - map to `ModelInfo[]`.
4. Define typed errors: `ProviderAuthError` (401/403), `ProviderUnavailableError` (network, 5xx, timeout), `ProviderBadResponseError` (invalid JSON/shape). Put them in `providers/errors.ts`. Error messages must **not** include the API key or request headers.
5. Tests: success; 401 gives `ProviderAuthError`; 500 gives unavailable; timeout; malformed body; no `Authorization` header when no key is given; the key is not present in any error message.

**Watch out:** Ollama's `/v1/models` works without a key. OpenRouter returns richer fields; ignoring extra fields keeps you compatible.

**Done when**
- [ ] All tests pass.

**Commit:** `step S1.3: openai-compatible listModels`

---

## S1.4 OpenAI-compatible adapter: streamChat
**Goal:** stream a chat completion and convert it into `ChatChunk`s.
**Needs:** S1.3

**How the upstream stream looks:** a response with `Content-Type: text/event-stream`, lines such as
`data: {"choices":[{"delta":{"content":"Hi"}}]}` separated by blank lines, ending with `data: [DONE]`. Lines starting with `:` are comments. Network chunks can cut a line in half.

**Instructions**
1. Write a standalone, well-tested parser `parseSse(stream: ReadableStream<Uint8Array>): AsyncIterable<string>` that yields the payload of each `data:` line:
   - decode with `TextDecoder` using `{ stream: true }`;
   - keep a `buffer`; split on `\n`; keep the last partial line in the buffer;
   - ignore empty lines and lines starting with `:`;
   - strip the `data:` prefix and one optional space.
2. Implement `streamChat(req, apiKey)` as an `async function*`:
   - `POST ${baseUrl}/chat/completions` with JSON `{ model, messages, stream: true, stream_options: { include_usage: true } }`, `Content-Type: application/json`, bearer auth if a key is given, `signal: req.signal`;
   - if `!res.ok`, read a short part of the body (cap at 2 KB) for diagnostics, `yield { type: 'error', code, message }` using safe codes (`auth_failed` for 401/403, `rate_limited` for 429, `provider_error` otherwise) and **return**;
   - for each payload: if `[DONE]` stop; otherwise `JSON.parse` inside try/catch (skip malformed lines), validate lightly with Zod;
   - `choices[0].delta.content` (string, non-empty) yields `text_delta`; `choices[0].finish_reason` yields `finish`; a top-level `usage` object yields `usage` (`prompt_tokens`, `completion_tokens`);
   - if the fetch is aborted, stop quietly (no error chunk).
3. Wrap network failures into a single `yield { type: 'error', code: 'provider_unavailable', ... }`.
4. Tests using recorded fixtures stored in `tests/fixtures/sse/*.txt`:
   - normal stream, with `[DONE]`;
   - a stream split at arbitrary byte positions (write a helper that re-chunks a fixture into 1-byte chunks and check the output is identical);
   - usage chunk at the end;
   - upstream 401 and 429 produce the right error codes;
   - abort mid-stream stops iteration and does not throw;
   - the request body sent contains `stream: true` and the correct model.

**Watch out:** some providers send `delta.content: null` or role-only deltas. Skip them. Some local servers do not support `stream_options`; if the first request returns 400, you may retry once without it (optional, document if you add it).

**Done when**
- [ ] All tests pass, including the 1-byte chunking test.

**Commit:** `step S1.4: openai-compatible streamChat`

---

## S1.5 Models endpoint (server models only)
**Goal:** an API that tells the UI which models are available.
**Needs:** S1.1

**Instructions**
1. Create `src/app/api/models/route.ts` with `GET`. Return:
   ```json
   { "default": { "providerId": "openrouter", "modelId": "vendor/model-a" },
     "providers": [ { "id": "openrouter", "label": "OpenRouter",
        "models": [ { "modelId": "vendor/model-a", "keySource": "server" } ] } ] }
   ```
2. Group `ALLOWED_MODELS` by provider, keep env order, include the provider label.
3. Use a `toPublicProvider` mapper so no secret field can leak (write a test that `JSON.stringify(response)` does not contain any configured API key).

**Done when**
- [ ] Test with two providers verifies grouping, default, and no secret in output.

**Commit:** `step S1.5: models endpoint`

---

## S1.6 Streaming chat endpoint (stateless)
**Goal:** `POST /api/chat` streams a model response as SSE.
**Needs:** S1.4, S1.5

**Instructions**
1. Create `src/server/http/sse.ts` with a helper `sseResponse(generator, { signal })` that builds a `ReadableStream`, writes events using the format in README section 5.2, and sets headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
2. Create `src/app/api/chat/route.ts`:
   - export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`;
   - Zod body schema: `{ model: string, messages: { role: 'user'|'assistant', content: string (max 100k chars) }[] (max 200 items) }`. System messages are not accepted from the client;
   - parse `model` with `parseModelRef`; reject if not in `ALLOWED_MODELS` (400 `model_not_allowed`);
   - get the provider from the registry and call `streamChat` with the server key (`providers[id].serverApiKey`);
   - pass `request.signal` as the abort signal so closing the browser tab cancels the upstream call;
   - map chunks to SSE events (`text_delta` becomes `delta`, `finish`/`usage` accumulated into one final `done`, `error` becomes `error`).
3. Create a `tests/helpers/fake-provider.ts` and inject it by making the registry replaceable in tests (e.g. `getRegistry()` that tests can override).
4. Integration tests (call the route handler function directly with a `Request`):
   - streams deltas then `done`;
   - disallowed model returns 400;
   - aborting the request signal causes the fake provider's generator to stop (assert on a flag set in its `finally` block);
   - an error chunk becomes an `error` event.

**Watch out:** in the `ReadableStream`'s `cancel()` callback, abort your own `AbortController` so the upstream request stops. Without this you keep paying for tokens nobody reads.

**Done when**
- [ ] `curl -N -X POST localhost:3000/api/chat ...` prints events live (try it against a local Ollama).
- [ ] Tests pass.

**Commit:** `step S1.6: streaming chat endpoint`

---

## S1.7 Chat UI shell
**Goal:** a page where you type, send, and watch the answer stream in.
**Needs:** S1.6

**Instructions**
1. `pnpm dlx shadcn@latest init` and add `button`, `textarea`, `scroll-area`.
2. Create `src/lib/sse-client.ts`: an async generator that `fetch`es with `POST`, reads `response.body.getReader()`, decodes, parses the SSE format (event name + data JSON), and yields `{ event, data }`. Unit test the parser with split chunks.
3. Create the hook `useChatStream()` in `src/components/chat/use-chat-stream.ts` holding `messages`, `status` (`idle | streaming | error`), `send(text)`, `stop()`. It appends the user message, adds an empty assistant message, then appends each `delta` to it.
4. Create `MessageList` and `Composer` components. Composer: Enter sends, Shift+Enter newline, disabled while streaming, auto-grow textarea.
5. Auto-scroll to the bottom while streaming, **unless** the user scrolled up (check distance from bottom before scrolling).
6. Show a visible error message for `error` events.

**Done when**
- [ ] You can hold a multi-turn conversation with a local model.
- [ ] Hook tests (with a mocked fetch) verify delta accumulation.

**Commit:** `step S1.7: chat ui shell`

---

## S1.8 Markdown and code rendering
**Goal:** assistant replies look good and are safe.
**Needs:** S1.7

**Instructions**
1. `pnpm add react-markdown remark-gfm rehype-highlight highlight.js`.
2. Create `Markdown.tsx` using `react-markdown` with `remark-gfm` and `rehype-highlight`. **Do not** enable raw HTML (`rehype-raw`). Keep the default URL sanitisation; open links with `target="_blank" rel="noopener noreferrer"`.
3. Create a `CodeBlock` component with a language label and a "Copy" button (`navigator.clipboard.writeText`) that briefly shows "Copied".
4. Style with Tailwind typography (`@tailwindcss/typography`).
5. Tests (React Testing Library, add `jsdom` environment for component tests): headings, lists, tables, code fences render; a `<script>alert(1)</script>` string in the markdown appears as text and no `script` element exists; a `javascript:` link is not rendered as a live link.

**Done when**
- [ ] Tests pass and a long answer with code looks right in the browser.

**Commit:** `step S1.8: markdown rendering`

---

## S1.9 Stop and regenerate
**Goal:** cancel a running answer and re-ask the last question.
**Needs:** S1.7

**Instructions**
1. In `useChatStream`, keep an `AbortController` per request. `stop()` calls `abort()`, sets status `idle`, and **keeps** the partial text already shown.
2. Add `regenerate()`: only allowed when idle and the last message is from the assistant. Remove that last message and call the stream again with the history up to the last user message.
3. UI: while streaming the send button turns into a "Stop" button; after an answer, show a "Regenerate" button on the last assistant message only.
4. Tests: stop keeps partial text and does not set an error; regenerate replaces only the last assistant message; regenerate is not available while streaming.

**Done when**
- [ ] Manual test: stop mid-answer, then regenerate. Server logs show the upstream request was cancelled.

**Commit:** `step S1.9: stop and regenerate`

---

## S1.10 Model picker
**Goal:** switch models from the UI.
**Needs:** S1.5, S1.7

**Instructions**
1. Create a `useModels()` hook calling `GET /api/models`.
2. Create `ModelPicker` (shadcn `Select` with groups): one group per provider, option label is the model id. Preselect the default.
3. Selection state is `{ providerId, modelId, keySource }`. Send `model: "providerId:modelId"` with each request. (`keySource` is not sent yet; it matters in MVP D.)
4. Changing the model affects only the **next** message; history is replayed as is.
5. Test: with two providers, switching changes the `model` field in the request body of the next send.

**Done when**
- [ ] Test passes; manual switch between two local models works.

**Commit:** `step S1.10: model picker`

---

## S1.11 Quick start documentation and Ollama example
**Goal:** a newcomer can run the Draft in one command and talk to a local model.
**Needs:** S1.10, S0.7

**Instructions**
1. Write the README quick start:
   - `cp .env.example .env` and set one provider plus `ALLOWED_MODELS` / `DEFAULT_*`;
   - `docker compose --profile full up --build`, then open `http://localhost:3000`.
2. Add an Ollama example: `PROVIDER_LOCAL_BASE_URL=http://host.docker.internal:11434/v1`, `PROVIDER_LOCAL_REQUIRES_KEY=false`. The `extra_hosts` line in `docker-compose.yml` (from S0.7) makes `host.docker.internal` work on Linux too. Mention that Ollama must listen on a reachable address (`OLLAMA_HOST=0.0.0.0`).
3. Add an OpenRouter example and a table of all provider variables.
4. Update `.env.production.example` and `docs/deployment.md` with the provider variables (README rule 10), and add dummy provider values to `ci/.env.ci` if the app now requires them at startup.
5. Confirm the Docker smoke job in CI is still green.

**Done when**
- [ ] On a clean clone the quick start gives a working streaming chat with a local model.
- [ ] CI is green, including `docker-smoke`.

**Commit:** `step S1.11: quick start docs`
