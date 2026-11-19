import { hash, verify } from '@node-rs/argon2';

const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP minimum for Argon2id

export const hashPassword = (pw: string) => hash(pw, opts);
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw);

/**
 * Simple password strength rules: length 10 to 200, and not equal to the email.
 */
export type PasswordStrength =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePasswordStrength(pw: string, email: string): PasswordStrength {
  if (pw.length < 10 || pw.length > 200) {
    return { ok: false, reason: 'Password must be between 10 and 200 characters' };
  }
  if (pw === email) {
    return { ok: false, reason: 'Password must not be the same as your email' };
  }
  return { ok: true };
}
