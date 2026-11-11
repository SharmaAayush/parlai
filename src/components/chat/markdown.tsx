'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'

import { CodeBlock } from './code-block'

/**
 * Renders markdown safely using react-markdown with remark-gfm (tables,
 * task lists, strikethrough) and rehype-highlight (syntax highlighting).
 *
 * Raw HTML is NOT enabled (no rehype-raw), so user-supplied HTML never
 * executes. Links keep the default URL sanitisation and open in a new tab.
 */
export interface MarkdownProps {
  children: string
  className?: string
}

const components: Components = {
  pre({ children, className, ...props }) {
    const codeElement = React.Children.toArray(children).find(
      (child): child is React.ReactElement =>
        React.isValidElement(child),
    )

    const codeProps =
      codeElement && typeof codeElement.props === 'object' && codeElement.props
        ? (codeElement.props as { className?: string })
        : undefined

    const language = codeProps?.className?.replace(/language-/, '').toLowerCase()

    if (language && codeElement) {
      return <CodeBlock language={language}>{codeElement}</CodeBlock>
    }

    return (
      <pre className={className} {...props}>
        {children}
      </pre>
    )
  },

  a({ node, children, ...props }) {
    const href = (node as { url?: string }).url || ''
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4 hover:text-primary transition-colors"
      >
        {children}
      </a>
    )
  },
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
