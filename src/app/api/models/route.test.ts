import { describe, it, expect, vi, afterEach } from 'vitest';

async function importRouteWithEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  const mod = await import('./route');
  return mod;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

describe('GET /api/models', () => {
  it('returns default and providers grouped by provider in env order', async () => {
    const { GET } = await importRouteWithEnv(baseEnv());
    const res = await GET();
    const body = await res.json();

    expect(body.default).toEqual({
      providerId: 'openrouter',
      modelId: 'vendor/model-a',
    });
    expect(body.providers).toEqual([
      {
        id: 'openrouter',
        label: 'OpenRouter',
        models: [
          { modelId: 'vendor/model-a', keySource: 'server' },
        ],
      },
      {
        id: 'local',
        label: 'Local (Ollama)',
        models: [
          { modelId: 'llama3.1:8b', keySource: 'server' },
        ],
      },
    ]);
  });

  it('keeps env order when multiple models belong to one provider', async () => {
    const env = baseEnv();
    env['ALLOWED_MODELS'] = 'openrouter:vendor/model-b,openrouter:vendor/model-a,local:llama3.1:8b';
    env['DEFAULT_MODEL'] = 'vendor/model-b';
    const { GET } = await importRouteWithEnv(env);
    const res = await GET();
    const body = await res.json();

    expect(body.default).toEqual({ providerId: 'openrouter', modelId: 'vendor/model-b' });
    expect(body.providers[0].models).toEqual([
      { modelId: 'vendor/model-b', keySource: 'server' },
      { modelId: 'vendor/model-a', keySource: 'server' },
    ]);
  });

  it('never leaks the API key in the response', async () => {
    const { GET } = await importRouteWithEnv(baseEnv());
    const res = await GET();
    const text = await res.text();

    expect(text).not.toContain('sk-test');
  });
});
