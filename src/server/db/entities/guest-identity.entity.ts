import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An anonymous guest visitor, identified by a cookie id.
 */
@Entity({ name: 'guest_identities' })
export class GuestIdentity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'text', unique: true }) cookieId!: string;

  @Column({ type: 'text', nullable: true }) @Index() fingerprintHash!: string | null;

  @Column({ type: 'text', nullable: true }) @Index() ipHash!: string | null;

  @Column({ type: 'int', default: 0 }) messageCount!: number;

  @CreateDateColumn({ type: 'timestamptz' }) firstSeen!: Date;
}
