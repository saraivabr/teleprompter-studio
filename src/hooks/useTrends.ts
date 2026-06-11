import { useCallback, useState } from 'react'

export interface TrendTopic {
  title: string
  traffic: string | null
  news: string[]
}

type TrendsStatus = 'idle' | 'loading' | 'done' | 'error'

/** Carrega os assuntos em alta (Google Trends Brasil) do endpoint /api/trends. */
export function useTrends() {
  const [status, setStatus] = useState<TrendsStatus>('idle')
  const [trends, setTrends] = useState<TrendTopic[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      // no-store: ignora o cache HTTP do browser (a zona Cloudflare
      // sobrescreve o Cache-Control da origem), para o botão "Atualizar"
      // sempre buscar dados frescos. O edge do Worker ainda cacheia 30min.
      const res = await fetch('/api/trends', { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        const msg =
          typeof body?.error === 'string' && body.error.length < 200
            ? body.error
            : 'Erro ao carregar os temas em alta.'
        throw new Error(msg)
      }
      const data = (await res.json()) as { trends?: TrendTopic[] }
      setTrends(Array.isArray(data.trends) ? data.trends : [])
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar os temas em alta.')
      setStatus('error')
    }
  }, [])

  return { status, trends, error, load }
}
