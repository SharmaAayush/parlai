import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { resetDb, getTestDataSource } from '../helpers/db';
import { hashPassword } from '@/server/auth/password';
import { getUserFromToken } from '@/server/auth/session';

const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => ({ value: cookieStore.get(name) }),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
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

async function importLoginRoute() {
  for (const [key, value] of Object.entries(baseEnv())) {
    vi.stubEnv(key, value);
  }
  return await import('../../src/app/api/auth/login/route');
}

async function importLogoutRoute() {
  for (const [key, value] of Object.entries(baseEnv())) {
    vi.stubEnv(key, value);
  }
  return await import('../../src/app/api/auth/logout/route');
}

function requestWith(email: string, password: string): Request {
  return new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

async function createUser(email: string, password: string) {
  const ds = await getTestDataSource();
  await ds.getRepository('User').insert({
    email,
    passwordHash: await hashPassword(password),
    role: 'user',
    emailVerified: false,
  });
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

describe('POST /api/auth/login', () => {
  it('creates a session and sets the session cookie', async () => {
    await createUser('alice@example.com', 'Str0ngPassw0rd!');

    const { POST } = await importLoginRoute();
    const res = await POST(requestWith('alice@example.com', 'Str0ngPassw0rd!'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const token = cookieStore.get('parlai_session');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    // The database stores only the hash, never the raw token.
    const ds = await getTestDataSource();
    const [session] = await ds.query(
      'SELECT token_hash FROM auth_sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)',
      ['alice@example.com'],
    );
    expect(session.token_hash).not.toBe(token);
    expect(session.token_hash).toBe(createHash('sha256').update(token!).digest('hex'));
  });

  it('rejects a wrong password with a generic 401 and sets no cookie', async () => {
    await createUser('bob@example.com', 'Str0ngPassw0rd!');

    const { POST } = await importLoginRoute();
    const res = await POST(requestWith('bob@example.com', 'WrongPassword1!'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'invalid_credentials', message: 'Invalid email or password' },
    });
    expect(cookieStore.get('parlai_session')).toBeUndefined();
  });

  it('gives an identical 401 for an unknown email (no timing leak)', async () => {
    const { POST } = await importLoginRoute();

    const wrong = await POST(requestWith('bob@example.com', 'WrongPassword1!'));
    const unknown = await POST(requestWith('nobody@example.com', 'Str0ngPassw0rd!'));

    expect(wrong.status).toBe(unknown.status);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('rejects an invalid body with 400', async () => {
    const { POST } = await importLoginRoute();
    const res = await POST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the token and clears the cookie', async () => {
    await createUser('carol@example.com', 'Str0ngPassw0rd!');

    const { POST: login } = await importLoginRoute();
    let res = await login(requestWith('carol@example.com', 'Str0ngPassw0rd!'));
    expect(res.status).toBe(200);
    const token = cookieStore.get('parlai_session');
    expect(token).toBeDefined();

    const { POST: logout } = await importLogoutRoute();
    res = await logout();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cookieStore.get('parlai_session')).toBe('');

    expect(await getUserFromToken(token!)).toBeNull();
  });
});
