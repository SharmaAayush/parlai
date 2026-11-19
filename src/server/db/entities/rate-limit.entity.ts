import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fixed-window rate limit counter.
 * Composite primary key: (key, windowStart).
 */
@Entity({ name: 'rate_limits' })
export class RateLimit {
  @PrimaryColumn({ type: 'text' }) key!: string;

  @PrimaryColumn({ type: 'timestamptz' }) windowStart!: Date;

  @Column({ type: 'int', default: 0 }) count!: number;
}
