import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { migrations } from './index';

describe('migrations barrel', () => {
  it('registers all migration files', () => {
    const files = fs.readdirSync(__dirname);
    const migrationFiles = files.filter(
      (file) => file.endsWith('.ts') && file !== 'index.ts' && !file.endsWith('.test.ts'),
    );
    expect(migrations.length).toBe(migrationFiles.length);
  });
});

