import { cache } from 'react';
import { cookies } from 'next/headers';
import { getDataSource } from '../db/client';
import { AuthSession } from '../db/entities/auth-session.entity';
import { hashToken, generateToken } from './tokens';
import { env } from '../env';

/**
 * Sessions live for 30 days and slide on use (at most once per hour).
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'parlai_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Creates a session for `userId` and returns the raw token, which must be
 * shown to the client exactly once (via a cookie). Only the hash is stored.
 */
export async function createAuthSession(userId: string): Promise<string> {
  const token = generateToken();
  const ds = await getDataSource();
  await ds.getRepository(AuthSession).insert({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

/**
 * Looks up a session by its raw token. Returns the subject's user fields or
 * null when there is no matching, non-expired session.
 *
 * Slides the expiry on use, but at most once per hour, so a request does not
 * always write to the database.
 */
export async function getUserFromToken(
  token: string,
): Promise<{ id: string; email: string; role: string; emailVerified: boolean } | null> {
  const ds = await getDataSource();

  const session = await ds.getRepository(AuthSession).findOne({
    where: { tokenHash: hashToken(token) },
    relations: { user: true },
  });

  if (!session || !session.user) return null;
  if (session.expiresAt < new Date()) return null;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if (!session.lastUsedAt || session.lastUsedAt < oneHourAgo) {
    await ds.getRepository(AuthSession).update(session.id, {
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    emailVerified: session.user.emailVerified,
  };
}

export async function destroyAuthSession(token: string): Promise<void> {
  const ds = await getDataSource();
  await ds.getRepository(AuthSession).delete({ tokenHash: hashToken(token) });
}

export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  const ds = await getDataSource();
  await ds.getRepository(AuthSession).delete({ userId });
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Reads the session cookie and returns the current user, or null. Memoised
 * with React's `cache()` so repeated calls within a render pass hit once.
 */
export const getCurrentUser = cache(async (): Promise<{
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
} | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getUserFromToken(token);
});
