import { z } from 'zod';
import { ChatProvider, ChatRequest, ChatChunk, ModelInfo } from './types';
import {
  ProviderAuthError,
  ProviderUnavailableError,
  ProviderBadResponseError,
  ProviderError,
} from './errors';
import { parseSse } from './sse';

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

const ChatCompletionChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({
          content: z.string().optional(),
        }).optional(),
        finish_reason: z.string().optional().nullable(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

const REQUEST_TIMEOUT_MS = 10_000;
const ERROR_BODY_LIMIT = 2_048;

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

  async function* streamChat(
    req: ChatRequest,
    apiKey?: string,
  ): AsyncIterable<ChatChunk> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal: req.signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      yield {
        type: 'error',
        code: 'provider_unavailable',
        message: messageOf(err),
      };
      return;
    }

    if (!res.ok) {
      const bodyText = await readLimitedBody(res.body, ERROR_BODY_LIMIT);
      let code: string;
      switch (res.status) {
        case 401:
        case 403:
          code = 'auth_failed';
          break;
        case 429:
          code = 'rate_limited';
          break;
        default:
          code = 'provider_error';
      }
      yield {
        type: 'error',
        code,
        message: bodyText || `Provider returned ${res.status}`,
      };
      return;
    }

    try {
      for await (const payload of parseSse(res.body as ReadableStream<Uint8Array>)) {
        if (payload === '[DONE]') {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const validated = ChatCompletionChunkSchema.safeParse(parsed);
        if (!validated.success) continue;
        const data = validated.data;
        const choice = data.choices?.[0];
        if (choice) {
          const content = choice.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            yield { type: 'text_delta', text: content };
          }
          if (choice.finish_reason) {
            yield { type: 'finish', reason: choice.finish_reason };
          }
        }
        if (data.usage) {
          yield {
            type: 'usage',
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          };
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      yield {
        type: 'error',
        code: 'provider_unavailable',
        message: messageOf(err),
      };
    }
  }

  return { id: config.id, listModels, streamChat };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

async function readLimitedBody(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string> {
  if (!stream) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= limit) break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
