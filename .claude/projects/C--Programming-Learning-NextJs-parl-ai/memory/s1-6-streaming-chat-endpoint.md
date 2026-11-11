---
name: s1-6-streaming-chat-endpoint
description: Implementing S1.6 streaming chat endpoint (stateless POST /api/chat)
metadata:
  type: project
---

Completed Step S1.6 — streaming chat endpoint (stateless).

Files created:
- `src/server/http/sse.ts` — `sseResponse(generator, { signal })` building a ReadableStream with SSE format; headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; `cancel()` aborts an AbortController so upstream work stops; closes after generator completes.
- `src/app/api/chat/route.ts` — POST handler: `runtime='nodejs'`, `dynamic='force-dynamic'`; Zod body (model, messages[] max 200, content max 100k, role user|assistant only); `parseModelRef`; `model_not_allowed` 400 if not in ALLOWED_MODELS; `streamChat` with server key and `request.signal`; maps chunks to SSE events (`text_delta` → `delta`, `finish`+`usage` accumulated into one final `done`, `error` → `error`).
- `tests/helpers/fake-provider.ts` — fake ChatProvider with scripted chunks, delay option, `streamStopped` flag.
- `src/app/api/chat/route.test.ts` — 4 integration tests: deltas then done, 400 disallowed model, abort stops stream, error chunk → error event.

Modified:
- `src/server/providers/registry.ts` — added `getRegistry()`/`setRegistry()` so tests can inject a replaceable registry; `createDefaultRegistry()` helper.

Branch: step-s1-6-streaming-chat-endpoint. All checks pass: `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` passes (68 tests).