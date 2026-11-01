import 'dotenv/config';
import { createDataSource } from '../src/server/db/data-source';

export default async function globalSetup() {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    throw new Error('TEST_DATABASE_URL is not set');
  }

  const ds = createDataSource(testDbUrl);
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
  console.log('Global test setup complete: migrations applied to test database');
}