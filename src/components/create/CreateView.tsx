import { useState } from 'react'
import { useGenerateScript } from '../../hooks/useGenerateScript'
import { useTrends, type TrendTopic } from '../../hooks/useTrends'
import { saveScript } from '../../lib/storage'
import {
  CONTEXT_PRESETS,
  COVERS,
  DURATIONS,
  PLATFORMS,
  type ContextId,
  type Cover,
  type Duration,
  type Platform,
  type ScriptRequest,
} from '../../lib/types'
import { ScriptView } from '../script/ScriptView'
import './create.css'

const IDEA_MAX = 12_000
const MORAL_MAX = 2_000
const NOTES_MAX = 4_000

const PHASE_ANNOUNCEMENT: Record<string, string> = {
  connecting: 'Conectando…',
  thinking: 'Estruturando o roteiro…',
  streaming: 'Escrevendo o roteiro…',
  done: 'Roteiro pronto.',
  error: 'Ocorreu um erro na geração.',
}

export function CreateView() {
  const [idea, setIdea] = useState('')
  const [platform, setPlatform] = useState<Platform>('Reels')
  const [duration, setDuration] = useState<Duration>('30 a 60 segundos')
  const [moral, setMoral] = useState('')
  const [cover, setCover] = useState<Cover>('Automática')
  const [context, setContext] = useState<ContextId | null>(null)
  const [extraNotes, setExtraNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const { phase, text, error, generate, cancel } = useGenerateScript()
  const { status: trendsStatus, trends, error: trendsError, load: loadTrends } = useTrends()
  const busy = phase === 'connecting' || phase === 'thinking' || phase === 'streaming'

  const applyTrend = (trend: TrendTopic) => {
    const seed = trend.news[0] ? `${trend.title} — ${trend.news[0]}` : trend.title
    setIdea((prev) =>
      prev.trim() ? `${prev.trim()}\n\nGancho com tema em alta: ${seed}` : `Tema em alta: ${seed}`,
    )
    setCover('Tema do momento')
  }

  const currentRequest = (): ScriptRequest => ({
    idea,
    platform,
    duration,
    moral: moral.trim() || undefined,
    cover: cover === 'Automática' ? undefined : cover,
    context: context ?? undefined,
    extraNotes: extraNotes.trim() || undefined,
  })

  const handleGenerate = () => {
    if (!idea.trim() || busy) return
    setCopied(false)
    setSaved(false)
    void generate(currentRequest())
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — sem ação.
    }
  }

  const handleSave = () => {
    saveScript({ request: currentRequest(), raw: text })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="create-view">
      <section className="create-form" aria-label="Configuração do roteiro">
        <div className="field">
          <label htmlFor="idea">Ideia, tema ou texto bruto</label>
          <textarea
            id="idea"
            value={idea}
            maxLength={IDEA_MAX}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Ex.: IA que liga para o cliente dentro do WhatsApp durante o onboarding…"
            rows={7}
          />
        </div>

        <div className="field">
          <div className="trends-head">
            <span className="field-label-text">Temas em alta agora</span>
            <button
              type="button"
              className="btn btn-ghost trends-load"
              onClick={() => void loadTrends()}
              disabled={trendsStatus === 'loading'}
            >
              {trendsStatus === 'loading'
                ? 'Buscando…'
                : trendsStatus === 'done'
                  ? '↻ Atualizar'
                  : '🔥 Ver temas em alta'}
            </button>
          </div>

          {trendsStatus === 'error' && (
            <p className="field-hint trends-error" role="alert">
              {trendsError}
            </p>
          )}

          {trendsStatus === 'done' && trends.length > 0 && (
            <div className="trend-chips">
              {trends.map((trend, i) => (
                <button
                  key={`${trend.title}-${i}`}
                  type="button"
                  className="trend-chip"
                  onClick={() => applyTrend(trend)}
                  title={trend.news[0] ?? 'Usar como tema do momento'}
                >
                  <span className="trend-chip-title">{trend.title}</span>
                  {trend.traffic && <span className="trend-chip-traffic">{trend.traffic}</span>}
                </button>
              ))}
            </div>
          )}

          <p className="field-hint">
            Tendências de busca no Google (Brasil). Clique em uma para usar como “Tema do momento”.
          </p>
        </div>

        <fieldset className="field">
          <legend>Contexto pronto</legend>
          <div className="chip-group" role="radiogroup" aria-label="Contexto pronto">
            <button
              type="button"
              role="radio"
              aria-checked={context === null}
              className={`chip${context === null ? ' is-active' : ''}`}
              onClick={() => setContext(null)}
            >
              Nenhum
            </button>
            {CONTEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={context === preset.id}
                className={`chip${context === preset.id ? ' is-active' : ''}`}
                onClick={() => setContext(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Anexa os fatos do assunto ao pedido — escreva só a ideia, sem precisar explicar tudo.
          </p>
        </fieldset>

        <fieldset className="field">
          <legend>Plataforma</legend>
          <div className="chip-group" role="radiogroup" aria-label="Plataforma">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={platform === p}
                className={`chip${platform === p ? ' is-active' : ''}`}
                onClick={() => setPlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Duração</legend>
          <div className="chip-group" role="radiogroup" aria-label="Duração">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={duration === d}
                className={`chip${duration === d ? ' is-active' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="moral">Moral da história (opcional)</label>
          <textarea
            id="moral"
            value={moral}
            maxLength={MORAL_MAX}
            onChange={(e) => setMoral(e.target.value)}
            placeholder="Para onde apontar a atenção: o que você quer vender, ensinar ou fazer o público acreditar…"
            rows={2}
          />
        </div>

        <fieldset className="field">
          <legend>Capa do tema</legend>
          <div className="chip-group" role="radiogroup" aria-label="Capa do tema">
            {COVERS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cover === c}
                className={`chip${cover === c ? ' is-active' : ''}`}
                onClick={() => setCover(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="field-hint">
            A “capa” é o tema interessante que chama atenção antes de você entrar no assunto.
          </p>
        </fieldset>

        <div className="field">
          <label htmlFor="notes">Observações (opcional)</label>
          <textarea
            id="notes"
            value={extraNotes}
            maxLength={NOTES_MAX}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Ex.: cite o nome do produto, evite jargão X, tom mais provocativo…"
            rows={2}
          />
        </div>

        <div className="form-actions">
          {busy ? (
            <button type="button" className="btn btn-rec" onClick={cancel}>
              ■ Parar geração
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={!idea.trim()}
            >
              ● Gerar roteiro
            </button>
          )}
        </div>
      </section>

      <section className="create-result" aria-label="Roteiro gerado">
        <p className="sr-only" role="status">
          {PHASE_ANNOUNCEMENT[phase] ?? ''}
        </p>

        {phase === 'idle' && (
          <div className="result-empty">
            <p className="empty-glyph" aria-hidden="true">𝄞</p>
            <p>Descreva a ideia ao lado e gere um roteiro pronto para gravar.</p>
            <p className="empty-hint">
              O roteiro sai com pausas <span className="mark-pause pause-1">·</span>, tons{' '}
              <span className="mark-tone tone-up">↑</span> e ênfases já marcadas para teleprompter.
            </p>
          </div>
        )}

        {(phase === 'connecting' || phase === 'thinking') && (
          <div className="result-empty">
            <p className="pulse-dot" aria-hidden="true" />
            <p>{phase === 'thinking' ? 'Estruturando o roteiro…' : 'Conectando…'}</p>
          </div>
        )}

        {text && <ScriptView raw={text} streaming={phase === 'streaming'} />}

        {error && (
          <p className="result-error" role="alert">
            {error}
          </p>
        )}

        {phase === 'done' && text && (
          <div className="result-actions">
            <button type="button" className="btn btn-primary" onClick={() => void handleCopy()}>
              {copied ? '✓ Copiado' : 'Copiar texto'}
            </button>
            <button type="button" className="btn" onClick={handleSave}>
              {saved ? '✓ Salvo' : 'Salvar na biblioteca'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
