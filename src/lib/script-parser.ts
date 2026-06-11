import type { ParsedScript, Section, SectionKind, Token } from './types'

/**
 * Tokeniza uma linha do roteiro reconhecendo as marcações de teleprompter:
 *   **forte**  _suave_  /  //  ///  [R]  ↑  ↓  →
 * Barras só contam como pausa quando isoladas (evita capturar URLs).
 */
const INLINE_PATTERN =
  /(\*\*[^*\n]+\*\*)|(_[^_\n]+_)|((?<=^|\s)\/{1,3}(?=\s|$))|(\[R\])|([↑↓→])/g

export function tokenizeLine(text: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0

  const pushText = (value: string) => {
    if (value.length > 0) tokens.push({ kind: 'text', value })
  }

  for (const match of text.matchAll(INLINE_PATTERN)) {
    pushText(text.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length

    const [, strong, soft, slashes, breath, arrow] = match
    if (strong) {
      tokens.push({ kind: 'strong', value: strong.slice(2, -2) })
    } else if (soft) {
      tokens.push({ kind: 'soft', value: soft.slice(1, -1) })
    } else if (slashes) {
      tokens.push({ kind: 'pause', level: Math.min(slashes.length, 3) as 1 | 2 | 3 })
    } else if (breath) {
      tokens.push({ kind: 'breath' })
    } else if (arrow) {
      const direction = arrow === '↑' ? 'up' : arrow === '↓' ? 'down' : 'flat'
      tokens.push({ kind: 'tone', direction })
    }
  }
  pushText(text.slice(lastIndex))

  return tokens
}

function detectSection(line: string): { kind: SectionKind; label: string } | null {
  const compact = line.replace(/[*#_]/g, '').trim()
  if (/🎯|^HOOK\b/.test(compact)) return { kind: 'hook', label: 'Hook' }
  if (/📱|^DESENVOLVIMENTO\b/.test(compact)) return { kind: 'development', label: 'Desenvolvimento' }
  if (/⚡|^FECHAMENTO\b/.test(compact)) return { kind: 'closing', label: 'Fechamento' }
  return null
}

function isHashtagHeader(line: string): boolean {
  return /🔖/.test(line) || /^HASHTAGS\b/i.test(line.replace(/[*#_]/g, '').trim())
}

function isFooterStart(line: string): boolean {
  return /¿quieres/i.test(line) || /si deseas llevar/i.test(line)
}

function isTitleLine(line: string): boolean {
  return /vers[ãa]o otimizada/i.test(line)
}

function cleanTitle(line: string): string {
  return line
    .replace(/:sparkles:/gi, '')
    .replace(/[✨*]/g, '')
    .trim()
}

/**
 * Converte o texto bruto gerado pelo modelo na estrutura usada pela
 * visualização e pelo modo teleprompter.
 */
export function parseScript(raw: string): ParsedScript {
  const result: ParsedScript = {
    title: null,
    duration: null,
    sections: [],
    hashtags: [],
    footer: [],
  }

  let current: Section | null = null
  let mode: 'body' | 'hashtags' | 'footer' = 'body'

  const openSection = (kind: SectionKind, label: string) => {
    current = { kind, label, lines: [] }
    result.sections.push(current)
  }

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    if (mode === 'footer' || isFooterStart(line)) {
      mode = 'footer'
      result.footer.push(line)
      continue
    }

    if (mode === 'hashtags') {
      if (line.startsWith('#')) {
        result.hashtags.push(...line.split(/\s+/).filter((w) => w.startsWith('#')))
        continue
      }
      mode = 'body'
    }

    if (isTitleLine(line)) {
      result.title = cleanTitle(line)
      continue
    }

    const durationMatch = line.match(/^\[?\s*DURA[ÇC][ÃA]O\s*:\s*([^\]]+)\]?/i)
    if (durationMatch) {
      result.duration = durationMatch[1].trim()
      continue
    }

    if (isHashtagHeader(line)) {
      mode = 'hashtags'
      continue
    }

    const section = detectSection(line)
    if (section) {
      openSection(section.kind, section.label)
      continue
    }

    if (!current) openSection('other', '')
    current!.lines.push({ tokens: tokenizeLine(line) })
  }

  return result
}

