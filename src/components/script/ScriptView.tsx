import { useMemo } from 'react'
import { parseScript } from '../../lib/script-parser'
import type { SectionKind } from '../../lib/types'
import { ScriptLine } from './ScriptLine'
import './script.css'

const SECTION_ICON: Record<SectionKind, string> = {
  hook: '🎯',
  development: '📱',
  closing: '⚡',
  strategy: '🧠',
  other: '·',
}

interface ScriptViewProps {
  raw: string
  /** Mostra cursor pulsante enquanto o texto chega em streaming. */
  streaming?: boolean
}

/** Visualização formatada do roteiro com seções, marcações e hashtags. */
export function ScriptView({ raw, streaming = false }: ScriptViewProps) {
  const parsed = useMemo(() => parseScript(raw), [raw])

  return (
    <article className={`script-view${streaming ? ' is-streaming' : ''}`}>
      {(parsed.title || parsed.duration) && (
        <header className="script-head">
          {parsed.title && <h2>{parsed.title}</h2>}
          {parsed.duration && <span className="script-duration">{parsed.duration}</span>}
        </header>
      )}

      {parsed.sections.map((section, i) => (
        <section key={`${section.kind}-${i}`} className={`script-section section-${section.kind}`}>
          {section.label && (
            <h3 className="section-label">
              <span aria-hidden="true">{SECTION_ICON[section.kind]}</span> {section.label}
            </h3>
          )}
          {section.lines.map((line, j) => (
            <ScriptLine key={`${section.kind}-${i}-${j}`} line={line} />
          ))}
        </section>
      ))}

      {parsed.hashtags.length > 0 && (
        <footer className="script-hashtags" aria-label="Hashtags sugeridas">
          {parsed.hashtags.map((tag) => (
            <span key={tag} className="hashtag">
              {tag}
            </span>
          ))}
        </footer>
      )}

      {streaming && <span className="stream-cursor" aria-hidden="true" />}
    </article>
  )
}
