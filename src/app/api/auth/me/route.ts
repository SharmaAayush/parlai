import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  return NextResponse.json({
    user: user ? { id: user.id, email: user.email, role: user.role } : null,
  });
}
