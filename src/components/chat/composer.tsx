'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ComposerProps {
  disabled: boolean
  onSend: (text: string) => void
  placeholder?: string
}

export function Composer({ disabled, onSend, placeholder }: ComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = React.useState('')

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const text = value.trim()
      if (text.length > 0 && !disabled) {
        onSend(text)
        setValue('')
        textareaRef.current?.focus()
      }
    }
  }

  return (
    <div className="border-t border-input p-4">
      <form onSubmit={(event) => {
        event.preventDefault()
        const text = value.trim()
        if (text.length > 0 && !disabled) {
          onSend(text)
          setValue('')
          textareaRef.current?.focus()
        }
      }} className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? 'Type a message…'}
          className="flex-1 min-h-[44px] max-h-[200px]"
          onKeyDown={handleKeyDown}
        />
        <Button type="submit" disabled={disabled || value.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  )
}
