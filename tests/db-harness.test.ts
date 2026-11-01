import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resetDb, getTestDataSource, assertTestDatabase } from './helpers/db';

describe('Database test harness', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    const ds = await getTestDataSource();
    await ds.destroy();
  });

  it('assertTestDatabase passes for test database', () => {
    // This should not throw since we're using TEST_DATABASE_URL
    expect(() => assertTestDatabase()).not.toThrow();
  });

  it('resetDb runs without error', async () => {
    await expect(resetDb()).resolves.not.toThrow();
  });

  it('can execute a simple query', async () => {
    const ds = await getTestDataSource();
    const result = await ds.query('SELECT 1 as test');
    expect(result).toEqual([{ test: 1 }]);
  });

  it('running resetDb twice works', async () => {
    await resetDb();
    await resetDb();
    const ds = await getTestDataSource();
    const result = await ds.query('SELECT 1 as test');
    expect(result).toEqual([{ test: 1 }]);
  });
});