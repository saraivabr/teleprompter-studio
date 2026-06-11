import { useEffect, useMemo, useRef, useState } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { parseScript, prompterLines } from '../../lib/script-parser'
import { ScriptLine } from '../script/ScriptLine'
import './prompter.css'

const SPEED_MIN = 20
const SPEED_MAX = 280
const SPEED_STEP = 10
const FONT_MIN = 28
const FONT_MAX = 110
const FONT_STEP = 4
const COUNTDOWN_SECONDS = 3

interface PrompterViewProps {
  raw: string
  onClose: () => void
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function PrompterView({ raw, onClose }: PrompterViewProps) {
  const [speed, setSpeed] = useState(70)
  const [fontSize, setFontSize] = useState(52)
  const [mirrored, setMirrored] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [running, setRunning] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const reduceMotion = useMemo(prefersReducedMotion, [])

  const dialogRef = useRef<HTMLDialogElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)

  const lines = useMemo(() => prompterLines(parseScript(raw)), [raw])
  const { nudge, restart, atEnd, progress } = useAutoScroll({
    speed,
    running,
    contentRef,
    viewportRef,
  })

  // Abre como modal nativo: foco preso, Escape e restauração de foco grátis.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    playRef.current?.focus()
  }, [])

  useEffect(() => {
    if (atEnd) setRunning(false)
  }, [atEnd])

  // Contagem 3-2-1 antes de iniciar (pulada com reduced-motion).
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      setRunning(true)
      return
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const startFromTop = () => {
    restart()
    if (reduceMotion) setRunning(true)
    else setCountdown(COUNTDOWN_SECONDS)
  }

  const togglePlay = () => {
    if (running) {
      setRunning(false)
    } else if (countdown !== null) {
      setCountdown(null)
    } else if (atEnd) {
      startFromTop()
    } else if (reduceMotion) {
      setRunning(true)
    } else {
      setCountdown(COUNTDOWN_SECONDS)
    }
  }

  const handleRestart = () => {
    setRunning(false)
    setCountdown(null)
    restart()
  }

  const close = () => dialogRef.current?.close()

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowUp':
        e.preventDefault()
        setSpeed((s) => Math.min(s + SPEED_STEP, SPEED_MAX))
        break
      case 'ArrowDown':
        e.preventDefault()
        setSpeed((s) => Math.max(s - SPEED_STEP, SPEED_MIN))
        break
      case 'ArrowRight':
        e.preventDefault()
        nudge(140)
        break
      case 'ArrowLeft':
        e.preventDefault()
        nudge(-140)
        break
      case '+':
      case '=':
        setFontSize((f) => Math.min(f + FONT_STEP, FONT_MAX))
        break
      case '-':
        setFontSize((f) => Math.max(f - FONT_STEP, FONT_MIN))
        break
      case 'm':
      case 'M':
        setMirrored((v) => !v)
        break
      case 'r':
      case 'R':
        handleRestart()
        break
    }
  }

  const transform = `${mirrored ? 'scaleX(-1) ' : ''}${flipped ? 'scaleY(-1)' : ''}`.trim()

  return (
    <dialog
      ref={dialogRef}
      className="prompter"
      aria-label="Modo teleprompter"
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <div className="prompter-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="prompter-guide" aria-hidden="true" />

      <div
        ref={viewportRef}
        className="prompter-viewport"
        style={{ fontSize: `${fontSize}px`, transform: transform || undefined }}
      >
        <div ref={contentRef} className="prompter-content">
          {lines.map(({ section, line }, i) => {
            const isSectionStart = i === 0 || lines[i - 1].section !== section
            return (
              <div key={i} className="prompter-block">
                {isSectionStart && section.label && (
                  <p className="prompter-section-label">{section.label}</p>
                )}
                <ScriptLine line={line} />
              </div>
            )
          })}
          <p className="prompter-end" aria-hidden="true">
            — fim —
          </p>
        </div>
      </div>

      {countdown !== null && countdown > 0 && (
        <div className="prompter-countdown" aria-hidden="true">
          {countdown}
        </div>
      )}

      <div className="prompter-controls">
        <button type="button" className="btn btn-ghost" onClick={close}>
          ✕ Sair <kbd>Esc</kbd>
        </button>

        <div className="control-cluster">
          <button type="button" className="btn" onClick={handleRestart} aria-label="Reiniciar do topo">
            ⟲
          </button>
          <button
            ref={playRef}
            type="button"
            className={`btn ${running || countdown !== null ? 'btn-rec' : 'btn-primary'}`}
            onClick={togglePlay}
          >
            {running || countdown !== null ? '❚❚ Pausar' : atEnd ? '⟲ Recomeçar' : '▶ Rolar'}{' '}
            <kbd>espaço</kbd>
          </button>
        </div>

        <div className="control-cluster">
          <span className="control-label">Velocidade</span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setSpeed((s) => Math.max(s - SPEED_STEP, SPEED_MIN))}
            aria-label="Diminuir velocidade"
          >
            −
          </button>
          <input
            type="range"
            className="speed-range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Velocidade de rolagem"
          />
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setSpeed((s) => Math.min(s + SPEED_STEP, SPEED_MAX))}
            aria-label="Aumentar velocidade"
          >
            +
          </button>
        </div>

        <div className="control-cluster">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setFontSize((f) => Math.max(f - FONT_STEP, FONT_MIN))}
            aria-label="Diminuir fonte"
          >
            A−
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setFontSize((f) => Math.min(f + FONT_STEP, FONT_MAX))}
            aria-label="Aumentar fonte"
          >
            A+
          </button>
          <button
            type="button"
            className={`btn${mirrored ? ' btn-rec' : ''}`}
            onClick={() => setMirrored((v) => !v)}
            aria-pressed={mirrored}
            title="Espelhar na horizontal (vidro de teleprompter)"
          >
            ⇋
          </button>
          <button
            type="button"
            className={`btn${flipped ? ' btn-rec' : ''}`}
            onClick={() => setFlipped((v) => !v)}
            aria-pressed={flipped}
            title="Inverter na vertical"
          >
            ⇅
          </button>
        </div>
      </div>
    </dialog>
  )
}
