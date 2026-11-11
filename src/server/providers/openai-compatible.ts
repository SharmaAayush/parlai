import { z } from 'zod';
import { ChatProvider, ModelInfo } from './types';
import {
  ProviderAuthError,
  ProviderUnavailableError,
  ProviderBadResponseError,
  ProviderError,
} from './errors';

interface OpenAICompatibleConfig {
  id: string;
  baseUrl: string;
  serverApiKey?: string;
}

const ModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().optional(),
});

const ModelsListSchema = z.object({
  data: z.array(ModelSchema),
});

const REQUEST_TIMEOUT_MS = 10_000;

export function createOpenAICompatible(config: OpenAICompatibleConfig): ChatProvider {
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  async function listModels(apiKey?: string, signal?: AbortSignal): Promise<ModelInfo[]> {
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signals = [timeoutSignal].filter(Boolean);
    if (signal) signals.push(signal);
    const combined = AbortSignal.any(signals);

    const headers: HeadersInit = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
      const res = await fetch(`${baseUrl}/models`, { headers, signal: combined });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new ProviderAuthError(`Provider authentication failed (${res.status})`);
        }
        throw new ProviderUnavailableError(`Provider returned ${res.status}`);
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new ProviderBadResponseError('Provider returned invalid JSON');
      }

      let parsed: z.infer<typeof ModelsListSchema>;
      try {
        parsed = ModelsListSchema.parse(body);
      } catch {
        throw new ProviderBadResponseError('Provider returned an unexpected response shape');
      }

      return parsed.data.map((m) => ({
        id: m.id,
        label: m.name ?? m.id,
        contextLength: m.context_length,
      }));
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      throw new ProviderUnavailableError(`Provider request failed: ${messageOf(err)}`);
    }
  }

  async function* streamChat(): AsyncIterable<import('./types').ChatChunk> {
    // Implemented in step S1.4.
    return;
    yield {} as never;
  }

  return { id: config.id, listModels, streamChat };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
