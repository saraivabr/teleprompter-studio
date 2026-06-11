import { SYSTEM_PROMPT } from './prompt.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-opus-4.8'

interface OpenRouterDelta {
  choices?: { delta?: { content?: string; reasoning?: string }; finish_reason?: string | null }[]
  error?: { message?: string; code?: number | string }
}

interface GenerateOptions {
  apiKey: string
  userMessage: string
  model: string
  signal: AbortSignal
  onText(text: string): void
  onThinking(): void
  onDone(): void
  onError(message: string): void
}

function errorForStatus(status: number, detail: string): string {
  if (status === 401) return 'Chave do OpenRouter inválida. Verifique OPENROUTER_API_KEY no .env.'
  if (status === 402) return 'Créditos insuficientes no OpenRouter. Adicione créditos na sua conta.'
  if (status === 404) return 'Modelo não encontrado no OpenRouter. Verifique OPENROUTER_MODEL no .env.'
  if (status === 429) return 'Limite de requisições do OpenRouter atingido. Aguarde e tente de novo.'
  return `Erro do OpenRouter (${status})${detail ? `: ${detail.slice(0, 200)}` : ''}. Tente novamente.`
}

/**
 * Gera o roteiro via OpenRouter (API compatível com OpenAI, streaming SSE).
 */
export async function generateWithOpenRouter(opts: GenerateOptions): Promise<void> {
  const { apiKey, userMessage, model, signal, onText, onThinking, onDone, onError } = opts

  let response: Response
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/saraivabr/teleprompter-studio',
        'X-Title': 'Roteiro Studio',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    })
  } catch (error) {
    if (signal.aborted) return
    console.error('[openrouter] falha de rede', error)
    onError('Não foi possível conectar ao OpenRouter. Verifique sua internet.')
    return
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    console.error('[openrouter] HTTP %s %s', response.status, detail.slice(0, 500))
    onError(errorForStatus(response.status, detail))
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  let thinkingNotified = false

  const handleData = (payload: string) => {
    if (payload === '[DONE]') {
      finished = true
      onDone()
      return
    }
    let parsed: OpenRouterDelta
    try {
      parsed = JSON.parse(payload) as OpenRouterDelta
    } catch {
      return
    }
    if (parsed.error) {
      finished = true
      console.error('[openrouter] erro no stream', parsed.error)
      onError(`Erro do OpenRouter: ${parsed.error.message ?? 'desconhecido'}.`)
      return
    }
    const delta = parsed.choices?.[0]?.delta
    if (delta?.content) {
      onText(delta.content)
    } else if (delta?.reasoning && !thinkingNotified) {
      thinkingNotified = true
      onThinking()
    }
  }

  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        // Comentários SSE (": OPENROUTER PROCESSING") são keep-alive — ignora.
        if (line.startsWith('data: ')) handleData(line.slice(6))
        if (finished) return
      }
    }
  } catch (error) {
    if (signal.aborted || finished) return
    console.error('[openrouter] stream interrompido', error)
    onError('A conexão com o OpenRouter foi interrompida. Tente novamente.')
    return
  }

  if (!finished && !signal.aborted) {
    onError('O OpenRouter encerrou a resposta antes do fim. Tente novamente.')
  }
}
