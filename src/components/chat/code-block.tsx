'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'

interface CodeBlockProps {
  /** Programming language (e.g. "ts", "python") shown in the label. */
  language: string
  children: React.ReactNode
}

/**
 * Extracts plain text from a code element rendered by react-markdown /
 * rehype-highlight. rehype-highlight sets `dangerouslySetInnerHTML` on the
 * `<code>` element, so we fall back to parsing that HTML when `children` is
 * empty.
 */
function codeElementText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''

  const el = node as React.ReactElement & {
    props?: {
      children?: React.ReactNode
      dangerouslySetInnerHTML?: { __html: string }
    }
  }

  const html = el.props?.dangerouslySetInnerHTML?.__html
  if (typeof html === 'string') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = html
    return textarea.value
  }

  return codeElementText(el.props?.children ?? '')
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    const text = codeElementText(children)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard access may be blocked (e.g. in tests); ignore.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-input bg-muted">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-input bg-muted/50">
        <span className="text-muted-foreground">{language || 'text'}</span>
        <Button size="icon" onClick={handleCopy} className="ml-auto">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
        {children}
      </pre>
    </div>
  )
}
