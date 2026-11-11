---
name: s1-6-streaming-chat-endpoint
description: Implementing S1.6 streaming chat endpoint (stateless POST /api/chat)
metadata:
  type: project
---

In progress: Step S1.6 — streaming chat endpoint (stateless) per plan/02-phase1-draft.md.

Files to create:
- `src/server/http/sse.ts` — `sseResponse(generator, { signal })` helper building a ReadableStream with SSE format (Content-Type: text/event-stream, Cache-Control: no-cache no-transform, X-Accel-Buffering: no); cancel() aborts an AbortController so upstream stops.
- `src/app/api/chat/route.ts` — POST handler: runtime nodejs, dynamic force-dynamic; Zod body schema (model, messages[] max 200, content max 100k, role user|assistant only); parseModelRef; model_not_allowed 400 if not in ALLOWED_MODELS; streamChat with server key and req.signal; map chunks to SSE events (delta, done, error).
- `tests/helpers/fake-provider.ts` — fake ChatProvider for tests.
- `src/app/api/chat/route.test.ts` — integration tests.

Registry made replaceable via `getRegistry()`/`setRegistry()` in `src/server/providers/registry.ts`.

Branch: step-s1-6-streaming-chat-endpoint