// Worker da Cloudflare: serve o frontend (assets do Vite) e expõe
// POST /api/generate gerando via OpenRouter — mesma lógica do servidor local.
import { DEFAULT_OPENROUTER_MODEL, generateWithOpenRouter } from '../server/openrouter.ts'
import { buildUserMessage, validateBody } from '../server/request.ts'
import { fetchTrends } from '../server/trends.ts'

interface Env {
  ASSETS: Fetcher
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
  APP_PASSWORD?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

// O APK (Capacitor) roda a interface em https://localhost e chama esta API.
const APP_ORIGINS = new Set(['https://localhost'])

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  if (!APP_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function withCors(request: Request, response: Response): Response {
  const headers = corsHeaders(request)
  if (Object.keys(headers).length === 0) return response
  const wrapped = new Response(response.body, response)
  for (const [key, value] of Object.entries(headers)) wrapped.headers.set(key, value)
  return wrapped
}

function unauthorized(): Response {
  return new Response('Autenticação necessária.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Roteiro Studio", charset="UTF-8"' },
  })
}

function timingSafeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.APP_PASSWORD) return true
  const header = request.headers.get('Authorization') ?? ''
  const [scheme, encoded] = header.split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  try {
    const decoded = atob(encoded)
    const password = decoded.slice(decoded.indexOf(':') + 1)
    return timingSafeEquals(password, env.APP_PASSWORD)
  } catch {
    return false
  }
}

async function handleTrends(ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request('https://trends.internal/br')
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  try {
    const resp = json({ trends: await fetchTrends() })
    // s-maxage: o edge da Cloudflare guarda por 30min; max-age=0 faz o
    // browser revalidar sempre, para o botão "Atualizar" funcionar.
    resp.headers.set('Cache-Control', 'public, s-maxage=1800, max-age=0')
    ctx.waitUntil(cache.put(cacheKey, resp.clone()))
    return resp
  } catch (error) {
    console.error('[trends]', error)
    return json({ error: 'Não foi possível carregar os temas em alta agora.' }, 502)
  }
}

async function handleGenerate(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return json({ error: 'OPENROUTER_API_KEY não configurada no Worker.' }, 500)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const parsed = validateBody(body)
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400)
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (payload: Record<string, unknown>) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)).catch(() => {})

  ctx.waitUntil(
    (async () => {
      try {
        await generateWithOpenRouter({
          apiKey: env.OPENROUTER_API_KEY as string,
          userMessage: buildUserMessage(parsed),
          model: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
          signal: request.signal,
          onText: (text) => void send({ type: 'text', text }),
          onThinking: () => void send({ type: 'status', status: 'thinking' }),
          onDone: () => void send({ type: 'done' }),
          onError: (error) => void send({ type: 'error', error }),
        })
      } finally {
        await writer.close().catch(() => {})
      }
    })(),
  )

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Preflight do APK: responde antes da autenticação (o navegador não manda credenciais aqui).
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    return withCors(request, await route(request, env, ctx, url))
  },
}

async function route(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (!isAuthorized(request, env)) return unauthorized()

  if (url.pathname === '/api/health') {
    return json({
      ok: true,
      provider: 'openrouter',
      model: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    })
  }

  if (url.pathname === '/api/trends') {
    if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
    return handleTrends(ctx)
  }

  if (url.pathname === '/api/generate') {
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    return handleGenerate(request, env, ctx)
  }

  return env.ASSETS.fetch(request)
}
