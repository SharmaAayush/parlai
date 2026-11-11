import { ChatProvider, ChatChunk, ChatRequest } from '@/server/providers/types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeProvider implements ChatProvider {
  readonly id: string;
  readonly chunks: ChatChunk[];
  readonly delayMs: number;
  streamCalledWith: ChatRequest | null = null;
  streamStopped = false;
  failStream = false;

  constructor(id: string, chunks: ChatChunk[] = [], delayMs = 0) {
    this.id = id;
    this.chunks = chunks;
    this.delayMs = delayMs;
  }

  async listModels(): Promise<{ id: string; label?: string; contextLength?: number }[]> {
    return [{ id: 'fake-model', label: 'Fake Model' }];
  }

  async *streamChat(req: ChatRequest): AsyncIterable<ChatChunk> {
    this.streamCalledWith = req;
    try {
      if (this.failStream) throw new Error('stream failed');
      for (const chunk of this.chunks) {
        if (this.delayMs > 0) {
          await sleep(this.delayMs);
        }
        yield chunk;
      }
    } finally {
      this.streamStopped = true;
    }
  }
}

export function makeFakeProvider(
  id: string,
  chunks: ChatChunk[] = [],
  delayMs = 0,
): FakeProvider {
  return new FakeProvider(id, chunks, delayMs);
}
