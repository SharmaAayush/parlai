# Questions / open issues

## Build conflict: `cacheComponents` vs route segment config (pre-existing)

**Symptom:** `pnpm build` fails on `src/app/api/chat/route.ts`:
```
Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`.
Route segment config "runtime" is not compatible with `nextConfig.cacheComponents`.
```

**Cause:** `next.config.ts` sets `cacheComponents: true` (added in S0.8), while `src/app/api/chat/route.ts` (S1.6) declares `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, which Next.js 16 treats as incompatible with `cacheComponents`.

**Scope:** Both files are unchanged from `step-s1-6-streaming-chat-endpoint` (the parent branch). This is pre-existing and not caused by S1.7 work.

**Possible fixes (not applied here, out of scope for S1.7):**
- Remove `cacheComponents: true` from `next.config.ts`, or
- Make `/api/chat` a dynamic route segment that doesn't declare `runtime`/`dynamic`, or
- Verify whether Next.js 16.4.3 requires SSE routes to avoid `cacheComponents`.

**Recommendation:** Resolve before Phase Completion / any release build, but do not block S1.7 commit since tests, lint, and typecheck all pass.
