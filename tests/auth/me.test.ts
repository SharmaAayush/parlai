import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import { resetDb, getTestDataSource } from '../helpers/db';
import { createAuthSession } from '@/server/auth/session';

const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => ({ value: cookieStore.get(name) }),
    set: () => {},
  }),
}));

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    APP_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
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

async function importMeRoute() {
  for (const [key, value] of Object.entries(baseEnv())) {
    vi.stubEnv(key, value);
  }
  return await import('../../src/app/api/auth/me/route');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  cookieStore.clear();
});

beforeEach(async () => {
  await resetDb();
  for (const [key, value] of Object.entries(baseEnv())) {
    vi.stubEnv(key, value);
  }
});

afterAll(async () => {
  const ds = await getTestDataSource();
  await ds.destroy();
});

describe('GET /api/auth/me', () => {
  it('returns user null when there is no session cookie', async () => {
    const { GET } = await importMeRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns the current user when the session cookie is valid', async () => {
    const ds = await getTestDataSource();
    await ds.getRepository('User').insert({
      email: 'alice@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
      role: 'user',
      emailVerified: false,
    });
    const [user] = await ds.query('SELECT id FROM users WHERE email = $1', ['alice@example.com']);

    const token = await createAuthSession(user.id);
    cookieStore.set('parlai_session', token);

    const { GET } = await importMeRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: user.id, email: 'alice@example.com', role: 'user' },
    });
  });
});
