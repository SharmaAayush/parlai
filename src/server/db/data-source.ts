import 'reflect-metadata';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from './entities';
import { migrations } from './migrations';
import { env } from '../env';

// Relative imports only in this folder (README rule 11).

export function createDataSource(url = env.DATABASE_URL) {
  return new DataSource({
    type: 'postgres',
    url,
    driver: pg, // static import so Docker's file tracing includes `pg`
    namingStrategy: new SnakeNamingStrategy(),
    entities,
    migrations,
    synchronize: false, // NEVER true
    logging: ['error', 'warn'],
  });
}

export default createDataSource(); // the TypeORM CLI needs a default export
