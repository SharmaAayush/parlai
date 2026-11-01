import { getDataSource } from '../../src/server/db/client';

/**
 * Asserts that the current database URL points to a test database.
 * Throws if the database name doesn't end with '_test'.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  
  // Extract database name from URL
  const match = url.match(/\/([^/?#]+)(\?|#|$)/);
  const dbName = match ? match[1] : '';
  
  if (!dbName || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to run destructive operations on non-test database: ${dbName || 'unknown'}. Database name must end with '_test'`);
  }
}

/**
 * Truncates all tables in the public schema except the migrations table.
 * Uses RESTART IDENTITY CASCADE to reset sequences and handle foreign keys.
 */
export async function resetDb(): Promise<void> {
  assertTestDatabase();
  
  const ds = await getDataSource();
  
  // Get all table names in public schema except migrations
  const tables = await ds.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename != 'migrations'
  `);
  
  if (tables.length > 0) {
    const tableNames = tables.map((t: { tablename: string }) => t.tablename).join(', ');
    await ds.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
  }
}

/**
 * Returns the test DataSource (same connection code as production).
 */
export async function getTestDataSource() {
  return getDataSource();
}