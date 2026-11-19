import { DataSource } from 'typeorm';

/**
 * Test factories for the MVP core schema.
 *
 * Every factory takes the DataSource (or an EntityManager in a transaction) and
 * optional overrides. They return the inserted row.
 */
export async function createUser(
  ds: DataSource,
  overrides: Partial<{
    email: string;
    passwordHash: string;
    role: 'user' | 'admin';
    emailVerified: boolean;
  }> = {},
) {
  return ds.getRepository('User').insert({
    email: overrides.email ?? 'user@example.com',
    passwordHash: overrides.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$abc',
    role: overrides.role ?? 'user',
    emailVerified: overrides.emailVerified ?? false,
  });
}

export async function createGuest(
  ds: DataSource,
  overrides: Partial<{
    cookieId: string;
    fingerprintHash: string | null;
    ipHash: string | null;
    messageCount: number;
  }> = {},
) {
  return ds.getRepository('GuestIdentity').insert({
    cookieId: overrides.cookieId ?? 'guest-cookie',
    fingerprintHash: overrides.fingerprintHash ?? null,
    ipHash: overrides.ipHash ?? null,
    messageCount: overrides.messageCount ?? 0,
  });
}

export async function createChat(
  ds: DataSource,
  overrides: Partial<{
    ownerUserId: string | null;
    ownerGuestId: string | null;
    title: string;
    currentModel: string | null;
  }> = {},
) {
  return ds.getRepository('ChatSession').insert({
    ownerUserId: overrides.ownerUserId ?? null,
    ownerGuestId: overrides.ownerGuestId ?? null,
    title: overrides.title ?? 'Test chat',
    currentModel: overrides.currentModel ?? null,
  });
}
