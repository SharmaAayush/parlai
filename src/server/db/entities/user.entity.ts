import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Check,
} from 'typeorm';

/**
 * A registered user account.
 */
@Entity({ name: 'users' })
@Check('users_role_check', "role IN ('user','admin')")
@Check('users_email_lower', 'email = lower(email)')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'text', unique: true }) email!: string;

  @Column({ type: 'text', select: false }) passwordHash!: string;

  @Column({ type: 'boolean', default: false }) emailVerified!: boolean;

  @Column({ type: 'text', default: 'user' }) role!: 'user' | 'admin';

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
