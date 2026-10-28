import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { entities } from './index';

describe('entities barrel', () => {
  it('registers all entity files', () => {
    const files = fs.readdirSync(__dirname);
    const entityFiles = files.filter((file) => file.endsWith('.entity.ts'));
    expect(entities.length).toBe(entityFiles.length);
  });
});

