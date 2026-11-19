import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroyAuthSession, clearSessionCookie, SESSION_COOKIE_NAME } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroyAuthSession(token);
    await clearSessionCookie();
  }
  return NextResponse.json({ ok: true });
}
