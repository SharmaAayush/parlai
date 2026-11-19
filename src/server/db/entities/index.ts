import { AuthSession } from './auth-session.entity';
import { ChatSession } from './chat-session.entity';
import { GuestIdentity } from './guest-identity.entity';
import { Message } from './message.entity';
import { RateLimit } from './rate-limit.entity';
import { SessionEvent } from './session-event.entity';
import { SessionModelUsage } from './session-model-usage.entity';
import { User } from './user.entity';
import { UserProviderKey } from './user-provider-key.entity';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const entities: Function[] = [
  User,
  AuthSession,
  GuestIdentity,
  UserProviderKey,
  ChatSession,
  Message,
  SessionEvent,
  SessionModelUsage,
  RateLimit,
];
