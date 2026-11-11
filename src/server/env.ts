import { z } from 'zod';
import { loadProviderConfig, type ProviderConfigResult } from './providers/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  APP_URL: z.string().url('APP_URL must be a valid URL').default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let cachedProviderConfig: ProviderConfigResult | null = null;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function loadProviderConfigFromEnv(source: Record<string, string | undefined>): ProviderConfigResult {
  if (cachedProviderConfig === null) {
    cachedProviderConfig = loadProviderConfig(source);
  }
  return cachedProviderConfig;
}

const providerConfig = (() => {
  let result: ProviderConfigResult | null = null;
  return {
    get(): ProviderConfigResult {
      if (result === null) {
        result = loadProviderConfig(process.env);
      }
      return result;
    },
  };
})();

export function getProviders(): ProviderConfigResult['providers'] {
  return providerConfig.get().providers;
}

export function getAllowedModels(): ProviderConfigResult['allowedModels'] {
  return providerConfig.get().allowedModels;
}

export function getDefaultModel(): ProviderConfigResult['defaultModel'] {
  return providerConfig.get().defaultModel;
}

export function getDefaultProvider(): ProviderConfigResult['defaultProvider'] {
  return providerConfig.get().defaultProvider;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (cachedEnv === null) {
      cachedEnv = parseEnv(process.env);
    }
    return cachedEnv[prop as keyof Env];
  },
});