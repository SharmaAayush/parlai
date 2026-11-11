'use client'

import type { ChatMessage } from '@/server/providers/types'
import { Markdown } from './markdown'

interface MessageListProps {
  messages: ChatMessage[]
  status: 'idle' | 'streaming' | 'error'
}

export function MessageList({ messages, status }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 prose sm:prose-lg max-w-none">
      {messages.map((message, index) => (
        <div key={index} className="flex gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium">
            {message.role === 'user' ? 'U' : 'A'}
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {message.role}
            </div>
            <div
              className={`rounded-lg px-3 py-2 break-words ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {message.role === 'user' ? (
                <span>{message.content}</span>
              ) : (
                <Markdown className="prose-invert">{message.content}</Markdown>
              )}
            </div>
          </div>
        </div>
      ))}
      {status === 'streaming' && (
        <div className="flex gap-3 items-start">
          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium">A</div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">assistant</div>
            <div className="bg-secondary text-secondary-foreground rounded-lg px-3 py-2 flex gap-1">
              <span className="h-4 w-1 rounded-full bg-foreground animate-pulse" />
              <span className="h-4 w-1 rounded-full bg-foreground animate-pulse" style={{ animationDelay: '200ms' }} />
              <span className="h-4 w-1 rounded-full bg-foreground animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
