import { useCallback, useRef, useState } from 'react'
import type { ScriptRequest } from '../lib/types'

export type GenerationPhase = 'idle' | 'connecting' | 'thinking' | 'streaming' | 'done' | 'error'

interface GenerationState {
  phase: GenerationPhase
  text: string
  error: string | null
}

interface StreamEvent {
  type: 'text' | 'status' | 'done' | 'error'
  text?: string
  status?: string
  error?: string
}

const INITIAL: GenerationState = { phase: 'idle', text: '', error: null }

/**
 * Consome o endpoint /api/generate (SSE sobre POST) e expõe o texto
 * do roteiro conforme ele chega em streaming.
 */
export function useGenerateScript() {
  const [state, setState] = useState<GenerationState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const generate = useCallback(async (request: ScriptRequest) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({ phase: 'connecting', text: '', error: null })

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Erro ${response.status} ao gerar o roteiro.`)
      }
      if (!response.body) throw new Error('Resposta sem corpo de streaming.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let finished = false

      const handleEvent = (event: StreamEvent) => {
        if (event.type === 'text' && event.text) {
          accumulated += event.text
          setState({ phase: 'streaming', text: accumulated, error: null })
        } else if (event.type === 'status' && event.status === 'thinking') {
          setState((prev) => (prev.phase === 'connecting' ? { ...prev, phase: 'thinking' } : prev))
        } else if (event.type === 'done') {
          finished = true
          setState({ phase: 'done', text: accumulated, error: null })
        } else if (event.type === 'error') {
          finished = true
          setState({ phase: 'error', text: accumulated, error: event.error ?? 'Erro desconhecido.' })
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let separator: number
        while ((separator = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          const dataLine = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '))
          if (!dataLine) continue
          try {
            handleEvent(JSON.parse(dataLine.slice(6)) as StreamEvent)
          } catch {
            // Evento malformado — ignora e segue o stream.
          }
        }
      }

      if (!finished) {
        setState((prev) =>
          prev.phase === 'error'
            ? prev
            : { phase: 'error', text: accumulated, error: 'A conexão foi encerrada antes do fim.' },
        )
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setState(INITIAL)
        return
      }
      const message = error instanceof Error ? error.message : 'Erro inesperado.'
      setState((prev) => ({ phase: 'error', text: prev.text, error: message }))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancel()
    setState(INITIAL)
  }, [cancel])

  return { ...state, generate, cancel, reset }
}
