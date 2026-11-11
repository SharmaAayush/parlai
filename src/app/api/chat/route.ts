import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllowedModels, getProviders } from '@/server/env';
import { parseModelRef } from '@/server/providers/config';
import { getRegistry } from '@/server/providers/registry';
import { sseResponse } from '@/server/http/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(100_000),
});

const BodySchema = z.object({
  model: z.string().min(1),
  messages: MessageSchema.array().min(1).max(200),
});

function modelNotAllowed(model: string) {
  return new Response(
    JSON.stringify({ error: { code: 'model_not_allowed', message: `Model "${model}" is not allowed` } }),
    {
      status: 400,
      headers: { 'content-type': 'application/json' },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid request body' } },
      { status: 400 },
    );
  }

  const { providerId, modelId } = parseModelRef(body.model);

  const allowedModels = getAllowedModels();
  const isAllowed = allowedModels.some(
    (m) => m.providerId === providerId && m.modelId === modelId,
  );
  if (!isAllowed) {
    return modelNotAllowed(body.model);
  }

  const providers = getProviders();
  const providerConfig = providers.find((p) => p.id === providerId);
  if (!providerConfig) {
    return modelNotAllowed(body.model);
  }

  const registry = getRegistry();
  const provider = registry.get(providerId);

  const events: AsyncGenerator<{ event: string; data: object }> = (async function* () {
    let finishReason: string | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const chunk of provider.streamChat(
      { model: modelId, messages: body.messages, signal: request.signal },
      providerConfig.serverApiKey,
    )) {
      switch (chunk.type) {
        case 'text_delta':
          yield { event: 'delta', data: { text: chunk.text } };
          break;
        case 'finish':
          finishReason = chunk.reason;
          break;
        case 'usage':
          inputTokens = chunk.inputTokens;
          outputTokens = chunk.outputTokens;
          break;
        case 'error':
          yield { event: 'error', data: { code: chunk.code, message: chunk.message } };
          return;
      }
    }

    yield {
      event: 'done',
      data: {
        ...(finishReason !== undefined ? { reason: finishReason } : {}),
        ...(inputTokens !== undefined || outputTokens !== undefined
          ? { usage: { inputTokens, outputTokens } }
          : {}),
      },
    };
  })();

  return new Response(sseResponse(events, { signal: request.signal }), {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
