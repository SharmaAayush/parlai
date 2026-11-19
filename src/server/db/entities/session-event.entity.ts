import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

/**
 * An event recorded during a chat session (session created, message sent, model switched, error).
 */
@Entity({ name: 'session_events' })
export class SessionEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) sessionId!: string;

  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'session_id' }) session!: ChatSession;

  @Column({
    type: 'text',
    enum: [
      'session_created',
      'message_sent',
      'model_switched',
      'error',
    ],
  })
  type!: 'session_created' | 'message_sent' | 'model_switched' | 'error';

  @Column({ type: 'text', nullable: true }) fromModel!: string | null;

  @Column({ type: 'text', nullable: true }) toModel!: string | null;

  @Column({ type: 'int', nullable: true }) messageIndex!: number | null;

  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
