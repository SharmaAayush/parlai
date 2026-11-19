import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

/**
 * A user's saved API key for a provider (encrypted at rest).
 * Only `last4` and metadata are ever readable; `encryptedApiKey` is select: false.
 */
@Entity({ name: 'user_provider_keys' })
@Unique(['userId', 'providerId'])
export class UserProviderKey {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid', nullable: true }) userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' }) user!: User | null;

  @Column({ type: 'text' }) providerId!: string;

  @Column({ type: 'text', select: false }) encryptedApiKey!: string;

  @Column({ type: 'int', default: 1 }) keyVersion!: number;

  @Column({ type: 'text' }) last4!: string;

  @Column({
    type: 'text',
    enum: ['valid', 'invalid', 'unknown'],
    default: 'unknown',
  })
  validationStatus!: 'valid' | 'invalid' | 'unknown';

  @Column({ type: 'timestamptz', nullable: true }) validatedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
