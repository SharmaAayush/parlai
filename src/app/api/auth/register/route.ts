import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerUser } from '@/server/auth/registration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    email: z.string(),
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

  try {
    await registerUser(body);
  } catch (err) {
    if (err instanceof Error && 'status' in err && 'code' in err) {
      return NextResponse.json(
        { error: { code: (err as { code: string }).code, message: err.message } },
        { status: (err as { status: number }).status },
      );
    }
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Could not create account' } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
