import { NextResponse } from 'next/server';
import { getAllowedModels, getDefaultModel, getDefaultProvider, getProviders } from '@/server/env';
import { toPublicProvider } from '@/server/providers/config';

function keySourceFor(config: { serverApiKey?: string; requiresKey: boolean }): 'server' | 'user' {
  return config.serverApiKey !== undefined || config.requiresKey === false ? 'server' : 'user';
}

export async function GET() {
  const providers = getProviders();
  const allowedModels = getAllowedModels();
  const defaultProvider = getDefaultProvider();
  const defaultModel = getDefaultModel();

  // Group allowed models by provider, keeping provider env order.
  const modelsByProvider = new Map<string, string[]>();
  for (const model of allowedModels) {
    const group = modelsByProvider.get(model.providerId) ?? [];
    group.push(model.modelId);
    modelsByProvider.set(model.providerId, group);
  }

  const publicProviders = providers.map((config) => {
    const modelIds = modelsByProvider.get(config.id) ?? [];
    const models = modelIds.map((modelId) => ({
      modelId,
      keySource: keySourceFor(config),
    }));
    return toPublicProvider(config, models);
  });

  return NextResponse.json({
    default: { providerId: defaultProvider, modelId: defaultModel },
    providers: publicProviders,
  });
}
