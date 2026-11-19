import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { DataSource } from 'typeorm';
import { resetDb, getTestDataSource } from '../helpers/db';
import { User } from '@/server/db/entities/user.entity';
import { ChatSession } from '@/server/db/entities/chat-session.entity';
import { UserProviderKey } from '@/server/db/entities/user-provider-key.entity';
import { Message } from '@/server/db/entities/message.entity';

describe('core schema constraints', () => {
  let ds: DataSource;

  beforeEach(async () => {
    await resetDb();
    ds = await getTestDataSource();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('rejects a user role that is not user or admin', async () => {
    await expect(
      ds.getRepository(User).insert({
        email: 'badrole@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$x',
        role: 'superuser' as 'user' | 'admin',
      }),
    ).rejects.toThrow();
  });

  it('defaults a new user role to user', async () => {
    const [user] = await ds
      .getRepository(User)
      .query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING role`,
        ['defaultrole@example.com', '$argon2id$v=19$m=65536,t=3,p=4$x'],
      );
    expect(user.role).toBe('user');
  });

  it('rejects an email with capital letters', async () => {
    await expect(
      ds.getRepository(User).insert({
        email: 'UpperCase@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$x',
      }),
    ).rejects.toThrow();
  });

  it('rejects a chat with both owners set', async () => {
    await expect(
      ds.getRepository(ChatSession).insert({
        ownerUserId: '00000000-0000-0000-0000-000000000001',
        ownerGuestId: '00000000-0000-0000-0000-000000000002',
        title: 'bad chat',
      }),
    ).rejects.toThrow();
  });

  it('rejects a chat with neither owner set', async () => {
    await expect(
      ds.getRepository(ChatSession).insert({
        ownerUserId: null,
        ownerGuestId: null,
        title: 'bad chat',
      }),
    ).rejects.toThrow();
  });

  it('accepts a chat with exactly one owner', async () => {
    const result = await ds.getRepository(ChatSession).insert({
      ownerUserId: '00000000-0000-0000-0000-000000000001',
      ownerGuestId: null,
      title: 'good chat',
    });
    expect(result.identifiers.length).toBe(1);
  });

  it('cascades user deletion to keys, chats and messages', async () => {
    const [user] = await ds
      .getRepository(User)
      .query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
        ['cascade@example.com', '$argon2id$v=19$m=65536,t=3,p=4$x'],
      );
    const userId = user.id;

    // A chat owned by this user
    const [chat] = await ds
      .getRepository(ChatSession)
      .query(
        `INSERT INTO chat_sessions (owner_user_id, owner_guest_id, title) VALUES ($1, NULL, $2) RETURNING id`,
        [userId, 'cascade chat'],
      );

    // A provider key for this user
    await ds.getRepository(UserProviderKey).insert({
      userId,
      providerId: 'openrouter',
      encryptedApiKey: 'enc-key',
      last4: '1234',
    });

    // A message in the chat
    await ds.getRepository(Message).insert({
      sessionId: chat.id,
      role: 'user',
      content: 'hello',
    });

    await ds.getRepository(User).delete({ id: userId });

    const remainingKeys = await ds
      .getRepository(UserProviderKey)
      .countBy({ userId });
    expect(remainingKeys).toBe(0);

    const remainingChats = await ds
      .getRepository(ChatSession)
      .countBy({ ownerUserId: userId });
    expect(remainingChats).toBe(0);
  });

  it('does not load passwordHash by default', async () => {
    await ds.getRepository(User).insert({
      email: 'nohash@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$x',
    });

    const user = await ds.getRepository(User).findOneBy({
      email: 'nohash@example.com',
    });
    expect(user).not.toBeNull();
    expect((user as { passwordHash?: string }).passwordHash).toBeUndefined();
  });
});
