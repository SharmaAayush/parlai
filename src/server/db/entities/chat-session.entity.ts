import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';
import { GuestIdentity } from './guest-identity.entity';
import { User } from './user.entity';

/**
 * One conversation. Owned by either a user or a guest, never both.
 */
@Entity({ name: 'chat_sessions' })
@Check('chat_sessions_one_owner', '(owner_user_id IS NULL) <> (owner_guest_id IS NULL)')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid', nullable: true }) ownerUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'owner_user_id' }) ownerUser!: User | null;

  @Column({ type: 'uuid', nullable: true }) ownerGuestId!: string | null;

  @ManyToOne(() => GuestIdentity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'owner_guest_id' }) ownerGuest!: GuestIdentity | null;

  @Column({ type: 'text' }) title!: string;

  @Column({ type: 'text', nullable: true }) currentModel!: string | null;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
