import { useEffect, useRef } from 'react'
import { registerHead, removeHead, setHead, type HeadSpec } from './head'

/**
 * Set this page's <title>, meta tags, canonical and JSON-LD while it's
 * mounted. The most recently mounted page wins; unmounting hands the head
 * back to whatever is underneath (see ./head.ts).
 */
export function useDocumentHead(spec: HeadSpec): void {
  const idRef = useRef<number | null>(null)
  // Compared by value — callers build the spec inline on every render
  const serialized = JSON.stringify(spec)

  useEffect(() => {
    const id = registerHead()
    idRef.current = id
    return () => {
      removeHead(id)
      idRef.current = null
    }
  }, [])

  useEffect(() => {
    if (idRef.current !== null) setHead(idRef.current, JSON.parse(serialized) as HeadSpec)
  }, [serialized])
}
