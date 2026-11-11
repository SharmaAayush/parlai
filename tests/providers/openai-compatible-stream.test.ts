import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOpenAICompatible } from '../../src/server/providers/openai-compatible';

function installFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const originalFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn(handler);
  return () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  };
}

function sseResponse(text: string, init: ResponseInit = {}): Response {
  return new Response(text, {
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

async function collectChunks(
  provider: ReturnType<typeof createOpenAICompatible>,
  apiKey?: string,
) {
  const out: unknown[] = [];
  for await (const chunk of provider.streamChat({ model: 'gpt-4', messages: [] }, apiKey)) {
    out.push(chunk);
  }
  return out;
}

describe('createOpenAICompatible.streamChat', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('streams deltas then finish', async () => {
    let capturedBody: string | undefined;
    restore = installFetchMock(async (_input, init) => {
      capturedBody = String(init?.body);
      return sseResponse(
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
          'data: [DONE]\n\n',
      );
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-test',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' world' },
      { type: 'finish', reason: 'stop' },
    ]);
    expect(capturedBody).toContain('"stream":true');
    expect(capturedBody).toContain('"model":"gpt-4"');
  });

  it('yields usage chunk when present', async () => {
    restore = installFetchMock(async () => {
      return sseResponse(
        'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n' +
          'data: [DONE]\n\n',
      );
    });

    const provider = createOpenAICompatible({
      id: 'local',
      baseUrl: 'http://localhost:11434/v1',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'text_delta', text: 'Hi' },
      { type: 'finish', reason: 'stop' },
      { type: 'usage', inputTokens: 10, outputTokens: 5 },
    ]);
  });

  it('omits Authorization header when no key is given', async () => {
    const captured: RequestInit[] = [];
    restore = installFetchMock(async (_input, init) => {
      captured.push(init ?? {});
      return sseResponse('data: [DONE]\n\n');
    });

    const provider = createOpenAICompatible({
      id: 'local',
      baseUrl: 'http://localhost:11434/v1',
    });

    await collectChunks(provider, undefined);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers).not.toHaveProperty('Authorization');
  });

  it('401 produces error chunk with code auth_failed', async () => {
    restore = installFetchMock(async () => sseResponse('invalid key', { status: 401 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'error', code: 'auth_failed', message: expect.any(String) },
    ]);
  });

  it('429 produces error chunk with code rate_limited', async () => {
    restore = installFetchMock(async () => sseResponse('too many', { status: 429 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'error', code: 'rate_limited', message: expect.any(String) },
    ]);
  });

  it('500 produces error chunk with code provider_error', async () => {
    restore = installFetchMock(async () => sseResponse('boom', { status: 500 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'error', code: 'provider_error', message: expect.any(String) },
    ]);
  });

  it('network failure yields provider_unavailable error', async () => {
    restore = installFetchMock(async () => {
      throw new TypeError('fetch failed');
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    const chunks = await collectChunks(provider);

    expect(chunks).toEqual([
      { type: 'error', code: 'provider_unavailable', message: 'fetch failed' },
    ]);
  });

  it('abort stops quietly without throwing', async () => {
    const controller = new AbortController();
    restore = installFetchMock(async () => {
      return new Promise<Response>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-test',
    });

    const promise = collectChunks(provider, undefined);
    controller.abort();
    const chunks = await promise;

    expect(chunks).toEqual([]);
  });
});
