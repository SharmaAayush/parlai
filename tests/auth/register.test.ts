import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest';
import { resetDb, getTestDataSource } from '../helpers/db';

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

async function importRoute() {
  vi.resetModules();
  for (const [key, value] of Object.entries(baseEnv())) {
    vi.stubEnv(key, value);
  }
  return await import('../../src/app/api/auth/register/route');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  const ds = await getTestDataSource();
  await ds.destroy();
});

describe('POST /api/auth/register', () => {
  it('creates a user with role user', async () => {
    const { POST } = await importRoute();
    const request = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'Str0ngPassw0rd!' }),
    });
    const res = await POST(request);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const ds = await getTestDataSource();
    const [user] = await ds.query('SELECT email, role FROM users WHERE email = $1', [
      'alice@example.com',
    ]);
    expect(user.email).toBe('alice@example.com');
    expect(user.role).toBe('user');
  });

  it('rejects unknown keys such as role with 400 and creates nothing', async () => {
    const { POST } = await importRoute();
    const request = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        password: 'Str0ngPassw0rd!',
        role: 'admin',
      }),
    });
    const res = await POST(request);
    expect(res.status).toBe(400);

    const ds = await getTestDataSource();
    const [user] = await ds.query('SELECT id FROM users WHERE email = $1', [
      'bob@example.com',
    ]);
    expect(user).toBeUndefined();
  });

  it('rejects duplicate email with different casing as 409', async () => {
    const ds = await getTestDataSource();
    await ds.getRepository('User').insert({
      email: 'CAROL@EXAMPLE.COM',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
      role: 'user',
      emailVerified: false,
    });

    const { POST } = await importRoute();
    const request = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'carol@example.com', password: 'Str0ngPassw0rd!' }),
    });
    const res = await POST(request);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });

  it('stores an argon2id hash and never returns passwordHash', async () => {
    const { POST } = await importRoute();
    const request = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dave@example.com', password: 'Str0ngPassw0rd!' }),
    });
    const res = await POST(request);
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain('passwordHash');

    const ds = await getTestDataSource();
    const [user] = await ds.query('SELECT password_hash FROM users WHERE email = $1', [
      'dave@example.com',
    ]);
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
  });
});
