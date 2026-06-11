import type { Line } from '../../lib/types'

const PAUSE_LABEL: Record<1 | 2 | 3, string> = {
  1: 'pausa de 1 segundo',
  2: 'pausa de 2 segundos',
  3: 'pausa de 3 segundos',
}

const TONE_META = {
  up: { glyph: '↑', label: 'subir o tom', className: 'tone-up' },
  down: { glyph: '↓', label: 'baixar o tom', className: 'tone-down' },
  flat: { glyph: '→', label: 'manter o tom', className: 'tone-flat' },
} as const

interface ScriptLineProps {
  line: Line
}

/** Renderiza uma linha do roteiro com as marcações de teleprompter estilizadas. */
export function ScriptLine({ line }: ScriptLineProps) {
  return (
    <p className="script-line">
      {line.tokens.map((token, i) => {
        switch (token.kind) {
          case 'text':
            return <span key={i}>{token.value}</span>
          case 'strong':
            return (
              <strong key={i} className="mark-strong">
                {token.value}
              </strong>
            )
          case 'soft':
            return (
              <em key={i} className="mark-soft">
                {token.value}
              </em>
            )
          case 'pause':
            return (
              <span
                key={i}
                className={`mark-pause pause-${token.level}`}
                role="img"
                aria-label={PAUSE_LABEL[token.level]}
                title={PAUSE_LABEL[token.level]}
              >
                {'·'.repeat(token.level)}
              </span>
            )
          case 'breath':
            return (
              <span
                key={i}
                className="mark-breath"
                role="img"
                aria-label="respiração"
                title="respiração / troca de bloco"
              >
                R
              </span>
            )
          case 'tone': {
            const meta = TONE_META[token.direction]
            return (
              <span
                key={i}
                className={`mark-tone ${meta.className}`}
                role="img"
                aria-label={meta.label}
                title={meta.label}
              >
                {meta.glyph}
              </span>
            )
          }
        }
      })}
    </p>
  )
}
