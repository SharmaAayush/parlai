import { describe, it, expect } from 'vitest';
import {
  loadProviderConfig,
  providerEnvPrefix,
  parseModelRef,
  type ProviderConfig,
  type AllowedModel,
} from './config';

function baseEnv(): Record<string, string> {
  return {
    SUPPORTED_PROVIDERS: 'openrouter,local',
    PROVIDER_OPENROUTER_LABEL: 'OpenRouter',
    PROVIDER_OPENROUTER_TYPE: 'openai-compatible',
    PROVIDER_OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    PROVIDER_OPENROUTER_API_KEY: 'sk-test',
    PROVIDER_LOCAL_LABEL: 'Local (Ollama)',
    PROVIDER_LOCAL_TYPE: 'openai-compatible',
    PROVIDER_LOCAL_BASE_URL: 'http://localhost:11434/v1',
    PROVIDER_LOCAL_REQUIRES_KEY: 'false',
    ALLOWED_MODELS: 'openrouter:vendor/model-a,local:llama3.1:8b',
    DEFAULT_PROVIDER: 'openrouter',
    DEFAULT_MODEL: 'vendor/model-a',
  };
}

describe('providerEnvPrefix', () => {
  it('uppercases and replaces non-alphanumerics with underscore', () => {
    expect(providerEnvPrefix('my-prov')).toBe('PROVIDER_MY_PROV_');
  });
  it('keeps alphanumerics unchanged', () => {
    expect(providerEnvPrefix('openrouter')).toBe('PROVIDER_OPENROUTER_');
  });
});

describe('parseModelRef', () => {
  it('splits on the first colon', () => {
    expect(parseModelRef('local:llama3.1:8b')).toEqual({
      providerId: 'local',
      modelId: 'llama3.1:8b',
    });
  });
  it('throws when there is no colon', () => {
    expect(() => parseModelRef('nocolon')).toThrow('expected providerId:modelId');
  });
  it('throws when a side is empty', () => {
    expect(() => parseModelRef(':model')).toThrow('provider and model must be non-empty');
    expect(() => parseModelRef('prov:')).toThrow('provider and model must be non-empty');
  });
});

describe('loadProviderConfig', () => {
  it('parses a valid config', () => {
    const result = loadProviderConfig(baseEnv());
    expect(result.providers).toHaveLength(2);
    const openrouter = result.providers[0];
    expect(openrouter).toMatchObject<ProviderConfig>({
      id: 'openrouter',
      label: 'OpenRouter',
      type: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      requiresKey: true,
    });
    expect(openrouter?.serverApiKey).toBe('sk-test');
    const local = result.providers[1];
    expect(local).toMatchObject<ProviderConfig>({
      id: 'local',
      label: 'Local (Ollama)',
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      requiresKey: false,
    });
    expect(local?.serverApiKey).toBeUndefined();
    expect(result.allowedModels).toEqual<AllowedModel[]>([
      { providerId: 'openrouter', modelId: 'vendor/model-a' },
      { providerId: 'local', modelId: 'llama3.1:8b' },
    ]);
    expect(result.defaultModel).toBe('vendor/model-a');
  });

  it('defaults label to the provider id', () => {
    const env = baseEnv();
    delete env['PROVIDER_LOCAL_LABEL'];
    const result = loadProviderConfig(env);
    const local = result.providers.find((p) => p.id === 'local');
    expect(local?.label).toBe('local');
  });

  it('defaults requiresKey to true', () => {
    const env = baseEnv();
    delete env['PROVIDER_LOCAL_REQUIRES_KEY'];
    env['PROVIDER_LOCAL_API_KEY'] = 'sk-local';
    const result = loadProviderConfig(env);
    const local = result.providers.find((p) => p.id === 'local');
    expect(local?.requiresKey).toBe(true);
  });

  it('strips trailing slash from base URL', () => {
    const env = baseEnv();
    env['PROVIDER_OPENROUTER_BASE_URL'] = 'https://openrouter.ai/api/v1/';
    const result = loadProviderConfig(env);
    const openrouter = result.providers.find((p) => p.id === 'openrouter');
    expect(openrouter?.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('rejects unknown provider in ALLOWED_MODELS', () => {
    const env = baseEnv();
    env['ALLOWED_MODELS'] = 'openrouter:vendor/model-a,unknown:some-model';
    expect(() => loadProviderConfig(env)).toThrow(
      'provider "unknown" is not in SUPPORTED_PROVIDERS',
    );
  });

  it('rejects default model not in ALLOWED_MODELS', () => {
    const env = baseEnv();
    env['DEFAULT_MODEL'] = 'not-allowed';
    expect(() => loadProviderConfig(env)).toThrow('not in ALLOWED_MODELS');
  });

  it('rejects invalid base URL', () => {
    const env = baseEnv();
    env['PROVIDER_OPENROUTER_BASE_URL'] = 'not-a-url';
    expect(() => loadProviderConfig(env)).toThrow('must be a valid http(s) URL');
  });

  it('rejects model whose provider has no server access', () => {
    const env = baseEnv();
    delete env['PROVIDER_LOCAL_API_KEY'];
    env['PROVIDER_LOCAL_REQUIRES_KEY'] = 'true';
    expect(() => loadProviderConfig(env)).toThrow('has no server access');
  });

  it('rejects duplicate provider ids', () => {
    const env = baseEnv();
    env['SUPPORTED_PROVIDERS'] = 'openrouter,openrouter';
    expect(() => loadProviderConfig(env)).toThrow('Duplicate provider id');
  });

  it('collects all errors and throws one error', () => {
    const env = baseEnv();
    env['SUPPORTED_PROVIDERS'] = 'openrouter,openrouter';
    env['PROVIDER_OPENROUTER_BASE_URL'] = 'not-a-url';
    env['ALLOWED_MODELS'] = 'unknown:model';
    env['DEFAULT_MODEL'] = 'not-allowed';
    try {
      loadProviderConfig(env);
      throw new Error('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('Duplicate provider id');
      expect(message).toContain('must be a valid http(s) URL');
      expect(message).toContain('is not in SUPPORTED_PROVIDERS');
      expect(message).toContain('not in ALLOWED_MODELS');
    }
  });
});
