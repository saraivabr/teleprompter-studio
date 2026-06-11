import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { SYSTEM_PROMPT } from './prompt.ts'

const PORT = Number(process.env.PORT ?? 3939)
// Sem CLAUDE_MODEL definido, usa o modelo padrão configurado no Claude Code.
const MODEL = process.env.CLAUDE_MODEL
const MAX_IDEA_LENGTH = 12_000

const VALID_PLATFORMS = [
  'Reels',
  'TikTok',
  'YouTube Shorts',
  'YouTube longo',
  'Aula',
  'Podcast',
] as const

const VALID_DURATIONS = [
  '30 a 60 segundos',
  '1 a 3 minutos',
  '3 a 5 minutos',
  '5 a 10 minutos',
] as const

const VALID_COVERS = ['Tema universal', 'Tema do momento', 'Cultura pop'] as const

type Platform = (typeof VALID_PLATFORMS)[number]
type Duration = (typeof VALID_DURATIONS)[number]
type Cover = (typeof VALID_COVERS)[number]

interface GenerateRequest {
  idea: string
  platform: Platform
  duration: Duration
  moral?: string
  cover?: Cover
  extraNotes?: string
}

function validateBody(body: unknown): GenerateRequest | string {
  if (typeof body !== 'object' || body === null) return 'Corpo da requisição inválido.'
  const { idea, platform, duration, moral, cover, extraNotes } = body as Record<string, unknown>

  if (typeof idea !== 'string' || idea.trim().length === 0) {
    return 'Descreva a ideia ou tema do vídeo.'
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return `A ideia é longa demais (máximo de ${MAX_IDEA_LENGTH} caracteres).`
  }
  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    return 'Plataforma inválida.'
  }
  if (!VALID_DURATIONS.includes(duration as Duration)) {
    return 'Duração inválida.'
  }
  if (moral !== undefined && typeof moral !== 'string') {
    return 'Moral da história inválida.'
  }
  if (typeof moral === 'string' && moral.length > 2_000) {
    return 'A moral da história é longa demais.'
  }
  if (cover !== undefined && !VALID_COVERS.includes(cover as Cover)) {
    return 'Capa de tema inválida.'
  }
  if (extraNotes !== undefined && typeof extraNotes !== 'string') {
    return 'Observações extras inválidas.'
  }
  if (typeof extraNotes === 'string' && extraNotes.length > 4_000) {
    return 'As observações extras são longas demais.'
  }

  return {
    idea: idea.trim(),
    platform: platform as Platform,
    duration: duration as Duration,
    moral: typeof moral === 'string' && moral.trim() ? moral.trim() : undefined,
    cover: cover as Cover | undefined,
    extraNotes: typeof extraNotes === 'string' && extraNotes.trim() ? extraNotes.trim() : undefined,
  }
}

function buildUserMessage({ idea, platform, duration, moral, cover, extraNotes }: GenerateRequest): string {
  const lines = [
    `PLATAFORMA: ${platform}`,
    `DURAÇÃO ALVO: ${duration}`,
    '',
    'TEMA / IDEIA BRUTA:',
    idea,
  ]
  if (moral) {
    lines.push('', 'MORAL DA HISTÓRIA (aponte o roteiro sutilmente para isto):', moral)
  }
  if (cover) {
    lines.push(
      '',
      `CAPA DO TEMA: ${cover} — abra o roteiro chamando atenção com um tema desse tipo antes de entrar no assunto.`,
    )
  }
  if (extraNotes) {
    lines.push('', 'OBSERVAÇÕES ADICIONAIS:', extraNotes)
  }
  lines.push('', 'Crie o roteiro completo seguindo todas as regras.')
  return lines.join('\n')
}

/* ---- Integração com o Claude CLI (claude -p) ---- */

const CLI_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--strict-mcp-config',
  '--tools',
  '',
  '--max-turns',
  '1',
  '--exclude-dynamic-system-prompt-sections',
  '--system-prompt',
  SYSTEM_PROMPT,
  ...(MODEL ? ['--model', MODEL] : []),
]

interface CliStreamEvent {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  event?: {
    type?: string
    delta?: { type?: string; text?: string }
  }
}

let cliAvailable: boolean | null = null

function checkCli(): Promise<boolean> {
  if (cliAvailable !== null) return Promise.resolve(cliAvailable)
  return new Promise((resolve) => {
    const probe = spawn('claude', ['--version'], { stdio: 'ignore' })
    probe.on('error', () => {
      cliAvailable = false
      resolve(false)
    })
    probe.on('exit', (code) => {
      cliAvailable = code === 0
      resolve(cliAvailable)
    })
  })
}

const app = express()

// Proteção por senha (Basic Auth) — obrigatória ao expor o app na internet.
// Ativa quando a variável de ambiente APP_PASSWORD está definida.
const APP_PASSWORD = process.env.APP_PASSWORD
if (APP_PASSWORD) {
  const expected = Buffer.from(APP_PASSWORD)
  app.use((req, res, next) => {
    const header = req.headers.authorization ?? ''
    const [scheme, encoded] = header.split(' ')
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString()
      const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1))
      if (given.length === expected.length && timingSafeEqual(given, expected)) {
        next()
        return
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Roteiro Studio", charset="UTF-8"')
    res.status(401).send('Autenticação necessária.')
  })
}

app.use(express.json({ limit: '64kb' }))

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, cli: await checkCli() })
})

app.post('/api/generate', async (req, res) => {
  const parsed = validateBody(req.body)
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed })
    return
  }

  if (!(await checkCli())) {
    res.status(500).json({
      error:
        'Claude CLI não encontrado. Instale o Claude Code (https://claude.com/claude-code) e faça login com `claude`.',
    })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  const child = spawn('claude', CLI_ARGS, { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin.write(buildUserMessage(parsed))
  child.stdin.end()

  let clientGone = false
  res.on('close', () => {
    clientGone = true
    child.kill('SIGTERM')
  })

  let finished = false
  let thinkingNotified = false
  const stderrTail: string[] = []

  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail.push(chunk.toString())
    if (stderrTail.length > 20) stderrTail.shift()
  })

  const rl = readline.createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    let event: CliStreamEvent
    try {
      event = JSON.parse(line) as CliStreamEvent
    } catch {
      return // linha não-JSON (ruído de hooks etc.) — ignora
    }

    if (event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
      const delta = event.event.delta
      if (delta?.type === 'text_delta' && delta.text) {
        send({ type: 'text', text: delta.text })
      } else if (delta?.type === 'thinking_delta' && !thinkingNotified) {
        thinkingNotified = true
        send({ type: 'status', status: 'thinking' })
      }
      return
    }

    if (event.type === 'result') {
      finished = true
      if (event.subtype === 'success' && !event.is_error) {
        send({ type: 'done' })
      } else {
        const detail = typeof event.result === 'string' && event.result ? ` (${event.result.slice(0, 200)})` : ''
        send({ type: 'error', error: `A geração falhou${detail}. Tente novamente.` })
      }
    }
  })

  child.on('error', (error: NodeJS.ErrnoException) => {
    if (clientGone || finished) return
    finished = true
    cliAvailable = error.code === 'ENOENT' ? false : cliAvailable
    send({ type: 'error', error: 'Não foi possível executar o Claude CLI. Verifique a instalação do Claude Code.' })
    res.end()
  })

  child.on('exit', (code) => {
    rl.close()
    if (clientGone) return
    if (!finished) {
      const detail = stderrTail.join('').trim().slice(-300)
      console.error('[generate] CLI saiu sem resultado. code=%s stderr=%s', code, detail)
      send({
        type: 'error',
        error:
          code === 0
            ? 'A geração terminou sem resultado. Tente novamente.'
            : 'Erro ao gerar o roteiro. Verifique se o Claude Code está logado (rode `claude` no terminal).',
      })
    }
    res.end()
  })
})

// Em produção, serve o build do Vite.
if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  app.use(express.static(distDir))
  app.get('{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(
    `[roteiro-studio] servidor em http://localhost:${PORT} (via Claude CLI${MODEL ? `, modelo: ${MODEL}` : ''})`,
  )
})
