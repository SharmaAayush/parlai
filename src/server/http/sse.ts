type SSEEvent =
  | { event: string; data: string }
  | { event: string; data: object };

function encodeEvent({ event, data }: SSEEvent): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

/**
 * Builds a SSE `ReadableStream` from an async generator of events.
 *
 * `signal` lets the caller abort the stream. When the returned stream is
 * cancelled (e.g. the client closes the connection), `abortController` is
 * aborted so any upstream work stops instead of continuing to a nobody-reads
 * sink.
 */
export function sseResponse(
  generator: AsyncIterable<SSEEvent>,
  { signal }: { signal?: AbortSignal },
): ReadableStream {
  const abortController = new AbortController();

  if (signal) {
    const abort = () => abortController.abort();
    signal.addEventListener('abort', abort, { once: true });
  }

  const stream = new ReadableStream<SSEEvent>({
    start(controller) {
      const pump = async () => {
        try {
          for await (const event of generator) {
            if (abortController.signal.aborted) break;
            controller.enqueue(event);
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      };
      pump();
    },
    cancel() {
      abortController.abort();
    },
  });

  return new ReadableStream<string>({
    start(controller) {
      const pump = async () => {
        try {
          const reader = stream.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(encodeEvent(value));
            }
          } finally {
            reader.releaseLock();
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      };
      pump();
    },
    cancel() {
      abortController.abort();
    },
  });
}

export type { SSEEvent };
