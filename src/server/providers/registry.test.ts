import { describe, it, expect } from 'vitest';
import { AppError } from '../http/errors';
import { createRegistry } from './registry';
import { ChatProvider } from './types';

class FakeProvider implements ChatProvider {
  constructor(public readonly id: string, public readonly failList = false) {}
  listModels = async () => {
    if (this.failList) throw new Error('boom');
    return [{ id: 'fake-model', label: 'Fake Model' }];
  };
  async *streamChat() {
    if (this.failList) throw new Error('boom');
    return;
    yield {} as never;
  }
}

describe('createRegistry', () => {
  it('returns the provider for a known id', () => {
    const configs = { openrouter: { id: 'openrouter', type: 'openai-compatible' } };
    const factories = { 'openai-compatible': (c: unknown) => new FakeProvider((c as { id: string }).id) };
    const registry = createRegistry(configs, factories);

    const provider = registry.get('openrouter');
    expect(provider.id).toBe('openrouter');
  });

  it('reports has correctly', () => {
    const configs = { openrouter: { id: 'openrouter', type: 'openai-compatible' } };
    const factories = { 'openai-compatible': () => new FakeProvider('x') };
    const registry = createRegistry(configs, factories);

    expect(registry.has('openrouter')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('throws AppError for an unknown provider', () => {
    const configs = { openrouter: { id: 'openrouter', type: 'openai-compatible' } };
    const factories = { 'openai-compatible': () => new FakeProvider('x') };
    const registry = createRegistry(configs, factories);

    expect(() => registry.get('unknown')).toThrow(AppError);
    try {
      registry.get('unknown');
    } catch (err) {
      const e = err as AppError;
      expect(e.status).toBe(400);
      expect(e.code).toBe('unknown_provider');
    }
  });

  it('throws when no adapter factory exists for a provider type', () => {
    const configs = { openrouter: { id: 'openrouter', type: 'openai-compatible' } };
    const factories = {};
    expect(() => createRegistry(configs, factories)).toThrow(
      'no adapter factory for type "openai-compatible"',
    );
  });
});
