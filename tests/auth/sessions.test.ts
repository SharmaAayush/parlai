import { DataSource } from 'typeorm';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resetDb, getTestDataSource } from '../helpers/db';
import { createAuthSession, getUserFromToken, destroyAuthSession } from '@/server/auth/session';
import { hashToken } from '@/server/auth/tokens';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  const ds = await getTestDataSource();
  await ds.destroy();
});

async function createUser(ds: DataSource, email: string) {
  await ds.getRepository('User').insert({
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
    role: 'user',
    emailVerified: false,
  });
  const [row] = await ds.query(
    'SELECT id, email, role, email_verified FROM users WHERE email = $1',
    [email],
  );
  return row;
}

describe('auth sessions', () => {
  it('createAuthSession stores the hash, never the raw token', async () => {
    const ds = await getTestDataSource();
    const user = await createUser(ds, 'alice@example.com');

    const token = await createAuthSession(user.id);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);

    const [session] = await ds.query(
      'SELECT token_hash, expires_at FROM auth_sessions WHERE user_id = $1',
      [user.id],
    );
    expect(session.token_hash).toBe(hashToken(token));
    expect(session.token_hash).not.toBe(token);
    expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('getUserFromToken returns the user fields for a valid token', async () => {
    const ds = await getTestDataSource();
    const user = await createUser(ds, 'bob@example.com');
    const token = await createAuthSession(user.id);

    const sessionUser = await getUserFromToken(token);
    expect(sessionUser).toEqual({
      id: user.id,
      email: 'bob@example.com',
      role: 'user',
      emailVerified: false,
    });
  });

  it('getUserFromToken returns null for an unknown token', async () => {
    expect(await getUserFromToken('does-not-exist')).toBeNull();
  });

  it('getUserFromToken rejects an expired session', async () => {
    const ds = await getTestDataSource();
    const user = await createUser(ds, 'carol@example.com');
    await ds.getRepository('AuthSession').insert({
      userId: user.id,
      tokenHash: hashToken('expired-token'),
      expiresAt: new Date(0),
    });
    expect(await getUserFromToken('expired-token')).toBeNull();
  });

  it('destroyAuthSession deletes the session', async () => {
    const ds = await getTestDataSource();
    const user = await createUser(ds, 'dave@example.com');
    const token = await createAuthSession(user.id);

    expect(await getUserFromToken(token)).not.toBeNull();
    await destroyAuthSession(token);
    expect(await getUserFromToken(token)).toBeNull();

    const [row] = await ds.query('SELECT count(*) AS count FROM auth_sessions WHERE user_id = $1', [
      user.id,
    ]);
    expect(Number(row.count)).toBe(0);
  });
});
