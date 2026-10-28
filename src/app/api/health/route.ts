import { NextResponse } from 'next/server';
import { getDataSource } from '@/server/db/client';

export async function GET() {
  try {
    const ds = await getDataSource();
    await ds.query('select 1');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

