import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

/**
 * A single message within a chat session.
 */
@Entity({ name: 'messages' })
@Index(['sessionId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) sessionId!: string;

  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'session_id' }) session!: ChatSession;

  @Column({ type: 'text', enum: ['user', 'assistant'] }) role!: 'user' | 'assistant';

  @Column({ type: 'text' }) content!: string;

  @Column({ type: 'text', nullable: true }) model!: string | null;

  @Column({ type: 'text', enum: ['server', 'user'], nullable: true })
  keySource!: 'server' | 'user' | null;

  @Column({ type: 'jsonb', nullable: true }) tokenUsage!: Record<string, number> | null;

  @Column({
    type: 'text',
    enum: ['complete', 'partial', 'error'],
    default: 'complete',
  })
  status!: 'complete' | 'partial' | 'error';

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
