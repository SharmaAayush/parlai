'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/server/providers/types'
import { sseClient } from '@/lib/sse-client'

export type ChatStatus = 'idle' | 'streaming' | 'error'

export interface UseChatStreamOptions {
  /** Base URL of the chat endpoint (defaults to /api/chat). */
  url?: string
  /** Model id (providerId:modelId) to send with each request. */
  model?: string
  /** Optional initial conversation history. */
  initialMessages?: ChatMessage[]
}

export interface UseChatStreamReturn {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  send: (text: string) => Promise<void>
  stop: () => void
  regenerate: () => void
}

export function useChatStream({
  url = '/api/chat',
  model = '',
  initialMessages = [],
}: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const messagesRef = useRef<ChatMessage[]>(initialMessages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)

  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    streamingRef.current = false
    setStatus('idle')
    setError(null)
  }, [])

  const send = useCallback(
    async (text: string) => {
      if (status === 'streaming') return

      const userMessage: ChatMessage = { role: 'user', content: text }

      setMessages((prev) => [...prev, userMessage])
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      streamingRef.current = true
      setStatus('streaming')
      setError(null)

      // History to send upstream: everything before this turn plus the user message.
      const history = [...messagesRef.current, userMessage]

      try {
        for await (const event of sseClient(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages: history }),
          signal,
        })) {
          if (signal.aborted) break

          switch (event.event) {
            case 'delta':
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last?.role === 'assistant') {
                  last.content += event.data.text
                }
                return [...prev]
              })
              break
            case 'done':
              streamingRef.current = false
              setStatus('idle')
              break
            case 'error':
              streamingRef.current = false
              setError(event.data.message)
              setStatus('idle')
              break
          }
        }

        // If the stream closed without a `done` or `error`, mark idle.
        if (!signal.aborted && streamingRef.current) setStatus('idle')
      } catch (err) {
        if (signal.aborted) {
          // Stopped by the user; keep partial text, no error.
          streamingRef.current = false
          setStatus('idle')
          return
        }
        streamingRef.current = false
        setStatus('error')
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      }

      abortControllerRef.current = null
    },
    [status, url, model],
  )

  const regenerate = useCallback(() => {
    if (status === 'streaming') return

    const current = messagesRef.current
    const lastMessage = current[current.length - 1]
    if (current.length === 0 || lastMessage?.role !== 'assistant') return

    // Remove the last assistant message.
    const withoutLast = current.slice(0, -1)

    // Replay history up to the last user message (drop any trailing assistant-only tail).
    const lastUserIndex = withoutLast.findIndex((m) => m.role === 'user')
    const history = lastUserIndex === -1 ? [] : withoutLast.slice(0, lastUserIndex + 1)

    setMessages(history)
    messagesRef.current = history

    // Retry by resending the last user message.
    if (lastUserIndex !== -1) {
      const lastUser = history[lastUserIndex]!
      void send(lastUser.content)
    }
  }, [status, send])

  return { messages, status, error, send, stop, regenerate }
}
