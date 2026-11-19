import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataSource } from '@/server/db/client';
import { User } from '@/server/db/entities/user.entity';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { createAuthSession, setSessionCookie } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hash of a dummy password. Verifying against it takes the same code path as a
// real password, so login timing does not reveal whether an email exists.
const dummyHashPromise = hashPassword('do-not-use-this-login-dummy-password');

const BodySchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    password: z.string(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid request body' } },
      { status: 400 },
    );
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  const ds = await getDataSource();

  // `passwordHash` is `select: false` on the entity, so ask for it explicitly.
  const user = await ds
    .getRepository(User)
    .createQueryBuilder('u')
    .addSelect('u.passwordHash')
    .where('u.email = :email', { email: normalizedEmail })
    .getOne();

  let passwordValid = false;
  if (user) {
    passwordValid = await verifyPassword(user.passwordHash, body.password);
  } else {
    // Unknown email: still run one verification so timing does not leak it.
    await verifyPassword(await dummyHashPromise, body.password);
  }

  if (!passwordValid || !user) {
    // Only the `if (user)` branch above can set passwordValid to true, so a
    // valid password implies the user exists.
    return NextResponse.json(
      { error: { code: 'invalid_credentials', message: 'Invalid email or password' } },
      { status: 401 },
    );
  }

  const token = await createAuthSession(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
