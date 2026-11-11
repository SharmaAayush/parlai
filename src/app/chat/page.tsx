'use client'

import { useState } from 'react'
import { useChatStream } from '@/components/chat/use-chat-stream'
import { Button } from '@/components/ui/button'
import { MessageList } from '@/components/chat/message-list'
import { Composer } from '@/components/chat/composer'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function ChatPage() {
  const [model, setModel] = useState('')

  const { messages, status, error, send, stop } = useChatStream({
    url: '/api/chat',
    model,
    initialMessages: [{ role: 'assistant', content: 'How can I help you today?' }],
  })

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b border-input px-4 py-3 flex items-center justify-between bg-background/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Parl-ai</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Model</label>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="text-xs border rounded px-2 py-1 bg-background"
            disabled={status === 'streaming'}
          >
            <option value="">default</option>
          </select>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <MessageList messages={messages} status={status} />
        </ScrollArea>
        {error && (
          <div className="border border-destructive bg-destructive/10 text-destructive px-4 py-2 text-sm">
            {error}
          </div>
        )}
      </main>

      <Composer
        disabled={status === 'streaming'}
        onSend={send}
        placeholder="Type a message…"
      />

      {status === 'streaming' && (
        <div className="px-4 py-2 text-right">
          <Button variant="outline" size="sm" onClick={stop}>
            Stop
          </Button>
        </div>
      )}
    </div>
  )
}
