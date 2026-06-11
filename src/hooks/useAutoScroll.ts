import { useCallback, useEffect, useRef, useState } from 'react'

interface AutoScrollOptions {
  /** Velocidade em pixels por segundo. */
  speed: number
  running: boolean
  /** Elemento que rola (movido via transform). */
  contentRef: React.RefObject<HTMLElement | null>
  /** Viewport visível do prompter. */
  viewportRef: React.RefObject<HTMLElement | null>
}

/**
 * Rolagem automática do teleprompter animando `transform: translateY`
 * (propriedade composta — não dispara layout) via requestAnimationFrame.
 */
export function useAutoScroll({ speed, running, contentRef, viewportRef }: AutoScrollOptions) {
  const offsetRef = useRef(0)
  const speedRef = useRef(speed)
  const [atEnd, setAtEnd] = useState(false)
  const [progress, setProgress] = useState(0)

  speedRef.current = speed

  const apply = useCallback(() => {
    const content = contentRef.current
    if (content) content.style.transform = `translateY(${-offsetRef.current}px)`
  }, [contentRef])

  const maxOffset = useCallback(() => {
    const content = contentRef.current
    const viewport = viewportRef.current
    if (!content || !viewport) return 0
    // Para quando o fim do texto chega ao terço superior (zona de leitura).
    return Math.max(0, content.scrollHeight - viewport.clientHeight * 0.4)
  }, [contentRef, viewportRef])

  const sync = useCallback(() => {
    const limit = maxOffset()
    setProgress(limit > 0 ? Math.min(offsetRef.current / limit, 1) : 0)
    setAtEnd(offsetRef.current >= limit && limit > 0)
  }, [maxOffset])

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = Math.min((now - last) / 1000, 0.1)
      last = now
      const limit = maxOffset()
      offsetRef.current = Math.min(offsetRef.current + speedRef.current * deltaSeconds, limit)
      apply()
      sync()
      if (offsetRef.current >= limit) return
      frame = requestAnimationFrame(tick)
    }

    setAtEnd(false)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, apply, maxOffset, sync])

  const nudge = useCallback(
    (pixels: number) => {
      offsetRef.current = Math.max(0, Math.min(offsetRef.current + pixels, maxOffset()))
      apply()
      sync()
    },
    [apply, maxOffset, sync],
  )

  const restart = useCallback(() => {
    offsetRef.current = 0
    apply()
    sync()
  }, [apply, sync])

  return { nudge, restart, atEnd, progress }
}
