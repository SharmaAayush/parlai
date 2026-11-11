export type ProviderConfig = {
  id: string;
  label: string;
  type: 'openai-compatible';
  baseUrl: string;
  serverApiKey?: string;
  requiresKey: boolean;
};

export type AllowedModel = {
  providerId: string;
  modelId: string;
};

export type ProviderConfigResult = {
  providers: ProviderConfig[];
  allowedModels: AllowedModel[];
  defaultModel: string;
};

function providerEnvPrefix(id: string): string {
  const upper = id.toUpperCase();
  const cleaned = upper.replace(/[^A-Z0-9]/g, '_');
  return `PROVIDER_${cleaned}_`;
}

export { providerEnvPrefix };

function parseModelRef(s: string): { providerId: string; modelId: string } {
  const colonIndex = s.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid model reference "${s}": expected providerId:modelId`);
  }
  const providerId = s.slice(0, colonIndex);
  const modelId = s.slice(colonIndex + 1);
  if (providerId.length === 0 || modelId.length === 0) {
    throw new Error(`Invalid model reference "${s}": provider and model must be non-empty`);
  }
  return { providerId, modelId };
}

export { parseModelRef };

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadProviderConfig(source: Record<string, string | undefined>): ProviderConfigResult {
  const errors: string[] = [];

  const supportedRaw = source['SUPPORTED_PROVIDERS'] ?? '';
  const providerIds = supportedRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const seenProviderIds = new Set<string>();
  for (const id of providerIds) {
    if (seenProviderIds.has(id)) {
      errors.push(`Duplicate provider id: ${id}`);
    }
    seenProviderIds.add(id);
  }

  const providers: ProviderConfig[] = [];
  for (const id of providerIds) {
    const prefix = providerEnvPrefix(id);

    const label = source[`${prefix}LABEL`] ?? id;

    const typeRaw = source[`${prefix}TYPE`];
    let type: 'openai-compatible' | null = null;
    if (typeRaw === undefined || typeRaw === 'openai-compatible') {
      type = 'openai-compatible';
    } else {
      errors.push(`Provider ${id}: type must be "openai-compatible", got "${typeRaw}"`);
    }

    const baseUrlRaw = source[`${prefix}BASE_URL`];
    let baseUrl: string | null = null;
    if (baseUrlRaw === undefined || baseUrlRaw.length === 0) {
      errors.push(`Provider ${id}: ${prefix}BASE_URL is required`);
    } else if (!isHttpUrl(baseUrlRaw)) {
      errors.push(`Provider ${id}: ${prefix}BASE_URL must be a valid http(s) URL, got "${baseUrlRaw}"`);
    } else {
      baseUrl = baseUrlRaw.replace(/\/$/, '');
    }

    const serverApiKey = source[`${prefix}API_KEY`] ?? undefined;

    const requiresKeyRaw = source[`${prefix}REQUIRES_KEY`];
    const requiresKey = requiresKeyRaw === undefined ? true : requiresKeyRaw !== 'false';

    if (type !== null && baseUrl !== null) {
      providers.push({ id, label, type, baseUrl, serverApiKey, requiresKey });
    }
  }

  const allowedModelsRaw = source['ALLOWED_MODELS'] ?? '';
  const allowedModels: AllowedModel[] = [];
  for (const ref of allowedModelsRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)) {
    let parsed: { providerId: string; modelId: string };
    try {
      parsed = parseModelRef(ref);
    } catch (err) {
      errors.push(`ALLOWED_MODELS: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!seenProviderIds.has(parsed.providerId)) {
      errors.push(`ALLOWED_MODELS: provider "${parsed.providerId}" is not in SUPPORTED_PROVIDERS`);
    }
    allowedModels.push(parsed);
  }

  const providersById = new Map(providers.map((p) => [p.id, p]));
  for (const model of allowedModels) {
    const provider = providersById.get(model.providerId);
    if (!provider) continue;
    const hasServerAccess = provider.serverApiKey !== undefined || provider.requiresKey === false;
    if (!hasServerAccess) {
      errors.push(
        `ALLOWED_MODELS: model "${model.providerId}:${model.modelId}" has no server access for provider "${model.providerId}" (no API key and requiresKey is true)`,
      );
    }
  }

  const defaultProvider = source['DEFAULT_PROVIDER'] ?? '';
  const defaultModelRaw = source['DEFAULT_MODEL'] ?? '';
  if (defaultProvider.length === 0 || defaultModelRaw.length === 0) {
    errors.push('DEFAULT_PROVIDER and DEFAULT_MODEL must both be set');
  } else {
    const isAllowed = allowedModels.some(
      (m) => m.providerId === defaultProvider && m.modelId === defaultModelRaw,
    );
    if (!isAllowed) {
      errors.push(
        `DEFAULT_MODEL "${defaultProvider}:${defaultModelRaw}" is not in ALLOWED_MODELS`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid provider configuration:\n${errors.join('\n')}`);
  }

  return { providers, allowedModels, defaultModel: defaultModelRaw };
}
