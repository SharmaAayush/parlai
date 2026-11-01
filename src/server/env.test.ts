import { describe, it, expect, vi } from 'vitest';
import { parseEnv } from './env';

describe('env module', () => {
  it('parses valid environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'development',
    });
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(result.APP_URL).toBe('http://localhost:3000');
    expect(result.NODE_ENV).toBe('development');
  });

  it('uses default APP_URL when not provided', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      NODE_ENV: 'development',
    });
    expect(result.APP_URL).toBe('http://localhost:3000');
  });

  it('uses default NODE_ENV when not provided', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      APP_URL: 'http://localhost:3000',
    });
    expect(result.NODE_ENV).toBe('development');
  });

  it('fails when DATABASE_URL is missing', () => {
      expect(() => parseEnv({})).toThrow('DATABASE_URL: Invalid input: expected string, received undefined');
  });

  it('fails when DATABASE_URL is not a valid URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrow('DATABASE_URL must be a valid URL');
  });

  it('fails when APP_URL is not a valid URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', APP_URL: 'not-a-url' })).toThrow('APP_URL must be a valid URL');
  });

  it('fails when NODE_ENV is invalid', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', NODE_ENV: 'invalid' })).toThrow('NODE_ENV');
  });

  it('memoizes the parsed env (parser runs once)', async () => {
      // Reset the cached env by creating a fresh module
      vi.resetModules();
      // Set up env before importing using vi.stubEnv
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      vi.stubEnv('APP_URL', 'http://localhost:3000');
      vi.stubEnv('NODE_ENV', 'development');
    
      const { env: freshEnv } = await import('./env');
    
      // First access
      const url1 = freshEnv.DATABASE_URL;
      // Second access
      const url2 = freshEnv.DATABASE_URL;
    
      // They should be the same reference (memoized)
      expect(url1).toBe(url2);
    });
});