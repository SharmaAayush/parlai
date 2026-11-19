import { createHash, randomBytes } from 'node:crypto';

/**
 * A random, URL-safe session token. Only this raw value is ever shown to the
 * client (as a cookie); the database stores only its hash.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex digest of a token, safe to store in the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
