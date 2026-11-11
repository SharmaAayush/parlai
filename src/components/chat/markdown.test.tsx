// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '@/components/chat/markdown'

function toBeInTheDocument(element: Element | null): void {
  expect(element).not.toBeNull()
}

function toHaveLength(nodes: { length: number }, n: number): void {
  expect(nodes.length).toBe(n)
}

describe('Markdown', () => {
  it('renders headings', () => {
    render(<Markdown># Heading 1</Markdown>)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Heading 1')
  })

  it('renders unordered lists', () => {
    render(<Markdown>- a\n- b</Markdown>)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(1)
    const text = items.map((i) => i.textContent).join(' ')
    expect(text).toContain('a')
    expect(text).toContain('b')
  })

  it('renders tables', () => {
    render(<Markdown>{'| a | b |\n| --- | --- |\n| 1 | 2 |'}</Markdown>)
    toBeInTheDocument(screen.getByRole('table'))
    toBeInTheDocument(screen.getByText('1'))
    toBeInTheDocument(screen.getByText('2'))
  })

  it('renders code fences', () => {
    render(<Markdown>```ts\nconst x = 1\n```</Markdown>)
    const code = screen.getByRole('code')
    expect(code.textContent).toContain('const x = 1')
  })

  it('escapes HTML so a script tag appears as text, not an element', () => {
    const scriptMd = '<script>alert(1)</script>'
    render(<Markdown>{scriptMd}</Markdown>)
    toHaveLength(document.querySelectorAll('script'), 0)
    toBeInTheDocument(screen.getByText('<script>alert(1)</script>'))
  })

  it('does not render javascript: links as live links', () => {
    render(<Markdown>[click](javascript:alert(1))</Markdown>)
    toHaveLength(screen.queryAllByRole('link'), 0)
  })
})
