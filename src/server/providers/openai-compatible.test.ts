import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOpenAICompatible } from './openai-compatible';

function installFetchMock(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn(handler);
  return () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('createOpenAICompatible.listModels', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the list of models', async () => {
    const captured: RequestInit[] = [];
    restore = installFetchMock(async (_input, init) => {
      captured.push(init ?? {});
      return jsonResponse({
        data: [
          { id: 'gpt-4', name: 'GPT-4', context_length: 8192 },
          { id: 'gpt-3.5-turbo' },
        ],
      });
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-test',
    });

    const models = await provider.listModels('sk-test');

    expect(models).toEqual([
      { id: 'gpt-4', label: 'GPT-4', contextLength: 8192 },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo', contextLength: undefined },
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
  });

  it('omits Authorization header when no key is provided', async () => {
    const captured: RequestInit[] = [];
    restore = installFetchMock(async (_input, init) => {
      captured.push(init ?? {});
      return jsonResponse({ data: [] });
    });

    const provider = createOpenAICompatible({
      id: 'local',
      baseUrl: 'http://localhost:11434/v1',
    });

    await provider.listModels();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers).not.toHaveProperty('Authorization');
  });

  it('strips trailing slash from base URL', async () => {
    const captured: string[] = [];
    restore = installFetchMock(async (input) => {
      captured.push(String(input));
      return jsonResponse({ data: [] });
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1/',
      serverApiKey: 'sk-test',
    });

    await provider.listModels('sk-test');

    expect(captured).toEqual(['https://openrouter.ai/api/v1/models']);
  });

  it('401 produces ProviderAuthError without the key', async () => {
    restore = installFetchMock(async () => jsonResponse({ error: { message: 'invalid key' } }, { status: 401 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 401,
      code: 'provider_auth_failed',
    });
  });

  it('403 produces ProviderAuthError', async () => {
    restore = installFetchMock(async () => jsonResponse({ error: { message: 'forbidden' } }, { status: 403 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 401,
      code: 'provider_auth_failed',
    });
  });

  it('500 produces ProviderUnavailableError without the key', async () => {
    restore = installFetchMock(async () => jsonResponse({ error: { message: 'boom' } }, { status: 500 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 502,
      code: 'provider_unavailable',
    });
  });

  it('network failure produces ProviderUnavailableError without the key', async () => {
    restore = installFetchMock(async () => {
      throw new TypeError('fetch failed');
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 502,
      code: 'provider_unavailable',
    });
  });

  it('fetch abort produces ProviderUnavailableError', async () => {
    const controller = new AbortController();
    restore = installFetchMock(async () => {
      return new Promise((resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    const promise = provider.listModels('sk-secret', controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      status: 502,
      code: 'provider_unavailable',
    });
  });

  it('malformed JSON produces ProviderBadResponseError', async () => {
    restore = installFetchMock(async () => new Response('not json', { status: 200 }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 502,
      code: 'provider_bad_response',
    });
  });

  it('unexpected response shape produces ProviderBadResponseError', async () => {
    restore = installFetchMock(async () => jsonResponse({ not_data: [] }));

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret',
    });

    await expect(provider.listModels('sk-secret')).rejects.toMatchObject({
      status: 502,
      code: 'provider_bad_response',
    });
  });

  it('never includes the API key in any error message', async () => {
    restore = installFetchMock(async () => {
      throw new TypeError('fetch failed');
    });

    const provider = createOpenAICompatible({
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      serverApiKey: 'sk-secret-key',
    });

    try {
      await provider.listModels('sk-secret-key');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('sk-secret-key');
      return;
    }
    throw new Error('should have thrown');
  });
});
