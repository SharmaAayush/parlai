import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

/**
 * Aggregated token/message usage per session, per model, per key source.
 * Composite primary key: (sessionId, model, keySource).
 */
@Entity({ name: 'session_model_usage' })
export class SessionModelUsage {
  @PrimaryColumn({ type: 'uuid' }) sessionId!: string;

  @PrimaryColumn({ type: 'text' }) model!: string;

  @PrimaryColumn({ type: 'text' }) keySource!: 'server' | 'user';

  @Column({ type: 'int', default: 0 }) userMessages!: number;

  @Column({ type: 'int', default: 0 }) agentMessages!: number;

  @Column({ type: 'int', default: 0 }) inputTokens!: number;

  @Column({ type: 'int', default: 0 }) outputTokens!: number;

  @Column({ type: 'int', default: 0 }) errors!: number;

  @CreateDateColumn({ type: 'timestamptz' }) firstUsed!: Date;

  @Column({ type: 'timestamptz' }) lastUsed!: Date;
}
