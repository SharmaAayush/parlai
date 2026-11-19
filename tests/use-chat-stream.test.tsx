// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useChatStream } from '@/components/chat/use-chat-stream'

function makeSseStream(events: { event: string; data: string }[]): ReadableStream {
  const encoder = new TextEncoder()
  const chunks = events.map((e) => encoder.encode(`event: ${e.event}\ndata: ${e.data}\n\n`))
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function TestComponent() {
  const { messages, status, error, send, stop, regenerate } = useChatStream()
  return (
    <div>
      <div data-testid="status">{status}</div>
      {error && <div data-testid="error">{error}</div>}
      <div data-testid="message-count">{messages.length}</div>
      <div data-testid="last-content">{messages[messages.length - 1]?.content ?? ''}</div>
      <button data-testid="send" onClick={() => void send('hello')}>send</button>
      <button data-testid="stop" onClick={stop}>stop</button>
      <button data-testid="regenerate" onClick={regenerate} disabled={status === 'streaming'}>
        regenerate
      </button>
    </div>
  )
}

describe('useChatStream', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('accumulates deltas into the assistant message and ends with done', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          makeSseStream([
            { event: 'delta', data: JSON.stringify({ text: 'Hel' }) },
            { event: 'delta', data: JSON.stringify({ text: 'lo' }) },
            { event: 'done', data: JSON.stringify({ reason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } }) },
          ]),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))

    expect(getByTestId('message-count').textContent).toBe('2') // user + assistant
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sets error on an error event', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          makeSseStream([{ event: 'error', data: JSON.stringify({ code: 'x', message: 'boom' }) }]),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    await waitFor(() => expect(getByTestId('error').textContent).toBe('boom'))
    expect(getByTestId('status').textContent).toBe('idle')
  })

  it('stop aborts the stream', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolve(new Response(makeSseStream([])))
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    fireEvent.click(getByTestId('stop'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stop keeps partial text and sets no error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        makeSseStream([
          { event: 'delta', data: JSON.stringify({ text: 'Hel' }) },
          { event: 'delta', data: JSON.stringify({ text: 'lo' }) },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, queryByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('streaming'))

    fireEvent.click(getByTestId('stop'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))
    expect(queryByTestId('error')).toBeNull()
    expect(getByTestId('last-content').textContent).toBe('Hello')
  })

  it('regenerate replaces only the last assistant message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        makeSseStream([
          { event: 'delta', data: JSON.stringify({ text: 'first' }) },
          { event: 'done', data: JSON.stringify({ reason: 'stop' }) },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))
    expect(getByTestId('message-count').textContent).toBe('2')
    expect(getByTestId('last-content').textContent).toBe('first')

    fireEvent.click(getByTestId('regenerate'))

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))
    // The old assistant message was removed; only user + new assistant remain.
    expect(getByTestId('message-count').textContent).toBe('2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('regenerate is not available while streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        makeSseStream([
          { event: 'delta', data: JSON.stringify({ text: 'slow' }) },
          { event: 'done', data: JSON.stringify({ reason: 'stop' }) },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<TestComponent />)
    fireEvent.click(getByTestId('send'))

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('streaming')
      expect((getByTestId('regenerate') as HTMLButtonElement).disabled).toBe(true)
    })

    await waitFor(() => expect(getByTestId('status').textContent).toBe('idle'))
    expect((getByTestId('regenerate') as HTMLButtonElement).disabled).toBe(false)
  })
})
