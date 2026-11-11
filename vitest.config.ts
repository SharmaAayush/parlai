import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // globalSetup: ['./tests/global-setup.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    },
    fileParallelism: false,
  },
});
