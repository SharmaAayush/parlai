export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        const payload = lineToPayload(line);
        if (payload !== undefined) {
          yield payload;
        }
      }
    }
    // Flush any trailing line that had no terminating newline.
    if (buffer.length > 0) {
      const payload = lineToPayload(buffer.replace(/\r$/, ''));
      if (payload !== undefined) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

function lineToPayload(line: string): string | undefined {
  if (line.length === 0) return undefined;
  if (line.startsWith(':')) return undefined;
  if (!line.startsWith('data:')) return undefined;
  let rest = line.slice(5);
  if (rest.startsWith(' ')) rest = rest.slice(1);
  return rest;
}
