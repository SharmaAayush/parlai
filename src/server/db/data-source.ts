import 'reflect-metadata';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { entities } from './entities';
import { migrations } from './migrations';

// Relative imports only in this folder (README rule 11).
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // Ignore if .env is missing (e.g. Docker, CI)
  }
}

export function createDataSource(url = process.env.DATABASE_URL) {
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
