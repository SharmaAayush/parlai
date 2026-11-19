import { AppError } from '../http/errors';
import { getDataSource } from '../db/client';
import { hashPassword, validatePasswordStrength } from './password';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string(),
});

export async function registerUser(input: { email: string; password: string }) {
  const { email, password } = registerSchema.parse(input);

  // Normalise email.
  const normalizedEmail = email.trim().toLowerCase();

  const strength = validatePasswordStrength(password, normalizedEmail);
  if (strength.ok === false) {
    throw AppError.badRequest(strength.reason);
  }

  const passwordHash = await hashPassword(password);

  try {
    const ds = await getDataSource();
    await ds.getRepository('User').insert({
      email: normalizedEmail,
      passwordHash,
      // role is not set: the DB default ('user') applies.
    });
  } catch (err) {
    // Unique violation on email: treat generically so we don't leak whether
    // the email exists.
    if (err instanceof Error && /duplicate key|unique violation|23505/i.test(err.message)) {
      throw new AppError(409, 'conflict', 'Could not create account');
    }
    throw err;
  }
}
