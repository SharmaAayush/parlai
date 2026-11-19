import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * An authenticated session. Only the token hash is stored, never the raw token.
 */
@Entity({ name: 'auth_sessions' })
export class AuthSession {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid', nullable: true }) userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' }) user!: User | null;

  @Column({ type: 'text', unique: true, select: false }) tokenHash!: string;

  @Column({ type: 'timestamptz' }) expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
}
