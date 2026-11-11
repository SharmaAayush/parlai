import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRegistry } from '@/server/providers/registry';
import { FakeProvider, makeFakeProvider } from '../../../../tests/helpers/fake-provider';

function parseSseText(text: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = [];
  let currentEvent = '';
  let currentData = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line.startsWith('data: ')) {
      currentData += line.slice(6);
    } else if (line.length === 0) {
      if (currentEvent || currentData) {
        events.push({ event: currentEvent, data: currentData ? JSON.parse(currentData) : undefined });
        currentEvent = '';
        currentData = '';
      }
    }
  }
  return events;
}

async function collectEvents(response: Response): Promise<string> {
  const chunks: string[] = [];
  const reader = response.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value;
      if (chunk) chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    }
  } finally {
    reader.releaseLock();
  }
  return chunks.join('');
}

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    SUPPORTED_PROVIDERS: 'openrouter,local',
    PROVIDER_OPENROUTER_LABEL: 'OpenRouter',
    PROVIDER_OPENROUTER_TYPE: 'openai-compatible',
    PROVIDER_OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    PROVIDER_OPENROUTER_API_KEY: 'sk-test',
    PROVIDER_LOCAL_LABEL: 'Local (Ollama)',
    PROVIDER_LOCAL_TYPE: 'openai-compatible',
    PROVIDER_LOCAL_BASE_URL: 'http://localhost:11434/v1',
    PROVIDER_LOCAL_REQUIRES_KEY: 'false',
    ALLOWED_MODELS: 'openrouter:vendor/model-a,local:llama3.1:8b',
    DEFAULT_PROVIDER: 'openrouter',
    DEFAULT_MODEL: 'vendor/model-a',
  };
}

function buildRegistry(provider: FakeProvider) {
  return createRegistry(
    { [provider.id]: { id: provider.id, type: 'openai-compatible' } },
    { 'openai-compatible': () => provider },
  );
}

describe('POST /api/chat', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function importRouteWithEnv(
    env: Record<string, string>,
    provider: FakeProvider,
  ) {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const mod = await import('./route');
    const { setRegistry: setReg } = await import('@/server/providers/registry');
    setReg(buildRegistry(provider));
    return mod;
  }

  it('streams deltas then done', async () => {
    const provider = makeFakeProvider('openrouter', [
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      { type: 'finish', reason: 'stop' },
      { type: 'usage', inputTokens: 5, outputTokens: 4 },
    ]);

    const mod = await importRouteWithEnv(baseEnv(), provider);
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openrouter:vendor/model-a',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const res = await mod.POST(request);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await collectEvents(res);
    const events = parseSseText(text);
    expect(events.map((e) => e.event)).toEqual(['delta', 'delta', 'done']);
    expect(events[0]!.data).toEqual({ text: 'Hel' });
    expect(events[1]!.data).toEqual({ text: 'lo' });
    expect(events[2]!.data).toMatchObject({ reason: 'stop', usage: { inputTokens: 5, outputTokens: 4 } });
  });

  it('returns 400 for a disallowed model', async () => {
    const provider = makeFakeProvider('openrouter', []);
    const mod = await importRouteWithEnv(baseEnv(), provider);
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openrouter:forbidden-model',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const res = await mod.POST(request);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('model_not_allowed');
  });

  it('aborting the request stops the provider stream', async () => {
    const provider = makeFakeProvider('openrouter', [
      { type: 'text_delta', text: 'a' },
      { type: 'text_delta', text: 'b' },
      { type: 'text_delta', text: 'c' },
    ], 50);
    const mod = await importRouteWithEnv(baseEnv(), provider);
    const controller = new AbortController();
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openrouter:vendor/model-a',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const res = await mod.POST(request);

    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();
    // Drain until the stream closes so the generator resumes and hits its finally.
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    reader.releaseLock();

    await new Promise((r) => setTimeout(r, 50));
    expect(provider.streamStopped).toBe(true);
  });

  it('an error chunk becomes an error event', async () => {
    const provider = makeFakeProvider('openrouter', [
      { type: 'error', code: 'provider_error', message: 'upstream failed' },
    ]);
    const mod = await importRouteWithEnv(baseEnv(), provider);
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openrouter:vendor/model-a',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const res = await mod.POST(request);
    const text = await collectEvents(res);
    const events = parseSseText(text);
    expect(events.map((e) => e.event)).toEqual(['error']);
    expect(events[0]!.data).toEqual({ code: 'provider_error', message: 'upstream failed' });
  });
});
