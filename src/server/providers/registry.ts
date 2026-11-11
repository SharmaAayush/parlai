import { AppError } from '../http/errors';
import { ChatProvider } from './types';

type AdapterFactory = (config: unknown) => ChatProvider;

interface Registry {
  get(id: string): ChatProvider;
  has(id: string): boolean;
}

export function createRegistry(configs: Record<string, unknown>, adapterFactories: Record<string, AdapterFactory>): Registry {
  const providers = new Map<string, ChatProvider>();

  for (const [id, config] of Object.entries(configs)) {
    const cfg = config as { type?: string } | undefined;
    const type = cfg?.type;
    if (!type) {
      throw new Error(`Provider "${id}": no "type" configured`);
    }
    const factory = adapterFactories[type];
    if (!factory) {
      throw new Error(`Provider "${id}": no adapter factory for type "${type}"`);
    }
    providers.set(id, factory(config));
  }

  return {
    get(id: string): ChatProvider {
      const provider = providers.get(id);
      if (!provider) {
        throw new AppError(400, 'unknown_provider', `Unknown provider "${id}"`);
      }
      return provider;
    },
    has(id: string): boolean {
      return providers.has(id);
    },
  };
}

let registry: Registry | null = null;

export function getRegistry(): Registry {
  if (!registry) {
    throw new Error('Provider registry has not been initialized. Call setRegistry() first.');
  }
  return registry;
}

export function setRegistry(r: Registry): void {
  registry = r;
}

export function createDefaultRegistry(
  configs: Record<string, unknown>,
  adapterFactories: Record<string, AdapterFactory>,
): Registry {
  registry = createRegistry(configs, adapterFactories);
  return registry;
}

export type { Registry };
