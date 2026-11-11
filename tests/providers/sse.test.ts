import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSse } from '../../src/server/providers/sse';

const FIXTURES_DIR = join(fileURLToPath(new URL('../fixtures/sse', import.meta.url)));

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

function rechunk(text: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.slice(i, i + size));
  }
  return chunks;
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of stream) {
    out.push(item);
  }
  return out;
}

describe('parseSse', () => {
  it('parses a normal stream including [DONE]', async () => {
    const result = await collect(parseSse(streamOf([new TextEncoder().encode(fixture('normal-stream.txt'))])));
    expect(result).toEqual([
      '{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}',
      '{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
      '{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '[DONE]',
    ]);
  });

  it('parses usage chunk at the end', async () => {
    const result = await collect(
      parseSse(streamOf([new TextEncoder().encode(fixture('with-usage.txt'))])),
    );
    expect(result).toEqual([
      '{"id":"chatcmpl-2","object":"chat.completion.chunk","created":123,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
      '{"id":"chatcmpl-2","object":"chat.completion.chunk","created":123,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      '[DONE]',
    ]);
  });

  it('ignores comments and blank lines', async () => {
    const text = ': this is a comment\n\ndata: hello\n';
    const result = await collect(parseSse(streamOf([new TextEncoder().encode(text)])));
    expect(result).toEqual(['hello']);
  });

  it('strips the data: prefix and one optional space', async () => {
    const text = 'data:no-space\ndata: with-space\n';
    const result = await collect(parseSse(streamOf([new TextEncoder().encode(text)])));
    expect(result).toEqual(['no-space', 'with-space']);
  });

  it('handles 1-byte chunking identical to a single chunk', async () => {
    const text = fixture('normal-stream.txt');
    const single = await collect(parseSse(streamOf([new TextEncoder().encode(text)])));
    for (const size of [1, 2, 3, 7, 16]) {
      const chunked = await collect(parseSse(streamOf(rechunk(text, size))));
      expect(chunked).toEqual(single);
    }
  });

  it('flushes a trailing line without a newline', async () => {
    const result = await collect(parseSse(streamOf([new TextEncoder().encode('data: trailing')])));
    expect(result).toEqual(['trailing']);
  });

  it('handles CRLF line endings', async () => {
    const text = 'data: crlf\r\n';
    const result = await collect(parseSse(streamOf([new TextEncoder().encode(text)])));
    expect(result).toEqual(['crlf']);
  });

  it('yields nothing for an empty stream', async () => {
    const result = await collect(parseSse(streamOf([])));
    expect(result).toEqual([]);
  });
});
