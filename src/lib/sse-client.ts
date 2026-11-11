'use client'

export type SSEEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { reason?: string; usage?: { inputTokens?: number; outputTokens?: number } } }
  | { event: 'error'; data: { code: string; message: string } }
  | { event: 'meta'; data: unknown };

/**
 * Parses a single SSE message block (its `event:`/`data:` lines) into an event.
 * Malformed `data` payloads are skipped (return null) so a corrupt line never
 * kills the whole stream.
 */
function parseSseBlock(event: string, data: string): SSEEvent | null {
  const trimmed = data.trim();
  if (!event && trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = trimmed.length === 0 ? undefined : JSON.parse(trimmed);
  } catch {
    return null;
  }
  return { event: event || 'message', data: parsed } as SSEEvent;
}

/**
 * POSTs to `url` and yields the SSE events from the response body as they arrive.
 *
 * Network chunks can arrive split anywhere (even mid-line), so a persistent
 * `buffer` holds the incomplete tail until a newline completes a line. Multiple
 * `data:` lines are concatenated, matching the SSE spec. An `AbortSignal` stops
 * iteration quietly (no error event) when the client disconnects.
 */
export async function* sseClient(
  url: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): AsyncGenerator<SSEEvent> {
  const { signal, ...fetchInit } = init;

  const response = await fetch(url, fetchInit);
  if (!response.ok) {
    throw new Error(`SSE request failed with status ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  const feedLine = (line: string): void => {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line.startsWith('data: ')) {
      currentData += line.slice(6) + '\n';
    }
  };

  try {
    for (;;) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let rawLine = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (rawLine.endsWith('\r')) rawLine = rawLine.slice(0, -1);

        if (rawLine.length === 0) {
          // Blank line terminates the current message block.
          if (currentEvent || currentData.length > 0) {
            const parsed = parseSseBlock(currentEvent, currentData);
            if (parsed) yield parsed;
            currentEvent = '';
            currentData = '';
          }
        } else {
          feedLine(rawLine);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any trailing block not terminated by a blank line.
  if (currentEvent || currentData.length > 0) {
    const parsed = parseSseBlock(currentEvent, currentData);
    if (parsed) yield parsed;
  }
}
