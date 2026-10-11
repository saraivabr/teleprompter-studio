import { useEffect, useMemo, useRef, useState } from 'react'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { useCamera } from '../../hooks/useCamera'
import { useNativeCamera } from '../../hooks/useNativeCamera'
import { isNativeApp, NativeCamera, type RemoteKey, type VideoQuality } from '../../lib/native-camera'
import { parseScript, prompterLines } from '../../lib/script-parser'
import { ScriptLine } from '../script/ScriptLine'
import './prompter.css'

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const SPEED_MIN = 20
const SPEED_MAX = 280
const SPEED_STEP = 10
const FONT_MIN = 28
const FONT_MAX = 110
const FONT_STEP = 4
const COUNTDOWN_SECONDS = 3
const NUDGE_PIXELS = 140
/** Espera no fim do texto antes de parar a gravação sozinha (respiro para o fechamento). */
const AUTO_STOP_DELAY_MS = 2500

// No APK a câmera é nativa (CameraX, MP4 na galeria); no navegador segue o MediaRecorder.
const usePlatformCamera: () => ReturnType<typeof useCamera> | ReturnType<typeof useNativeCamera> =
  isNativeApp ? useNativeCamera : useCamera

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
  const camera = usePlatformCamera()
  const nativeCam = 'native' in camera ? camera : null
  const armedRecordingRef = useRef(false)

  const toggleCamera = () => {
    if (camera.status === 'on') camera.stop()
    else if (camera.status !== 'requesting') void camera.start()
  }

  const toggleRecording = () => {
    if (camera.recording) {
      setRunning(false)
      void camera.stopRecording()
      return
    }
    if (!nativeCam) {
      void camera.startRecording()
      return
    }
    // APK: contagem 3-2-1 e começa a gravar e a rolar juntos, do topo.
    setRunning(false)
    restart()
    armedRecordingRef.current = true
    setCountdown(COUNTDOWN_SECONDS)
  }

  // Abre como modal nativo: foco preso, Escape e restauração de foco grátis.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    playRef.current?.focus()
  }, [])

  useEffect(() => {
    if (atEnd) setRunning(false)
  }, [atEnd])

  // APK: chegou ao fim do roteiro gravando → para e salva sozinho.
  useEffect(() => {
    if (!nativeCam || !atEnd || !camera.recording) return
    const timer = setTimeout(() => void camera.stopRecording(), AUTO_STOP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [nativeCam, atEnd, camera])


  // Contagem 3-2-1 antes de iniciar (pulada com reduced-motion).
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      setRunning(true)
      if (armedRecordingRef.current) {
        armedRecordingRef.current = false
        void camera.startRecording()
      }
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

  // APK: controle Bluetooth / pedal / botões de volume comandam o teleprompter.
  const remoteRef = useRef<(key: RemoteKey) => void>(() => {})
  remoteRef.current = (key: RemoteKey) => {
    if (key === 'volumeUp' || key === 'playPause') togglePlay()
    else if (key === 'volumeDown') toggleRecording()
    else if (key === 'pageDown' || key === 'next') nudge(NUDGE_PIXELS)
    else if (key === 'pageUp' || key === 'previous') nudge(-NUDGE_PIXELS)
  }
  useEffect(() => {
    if (!isNativeApp) return
    void NativeCamera.setRemoteEnabled({ enabled: true })
    const handle = NativeCamera.addListener('remoteKey', ({ key }) => remoteRef.current(key))
    return () => {
      void NativeCamera.setRemoteEnabled({ enabled: false })
      void handle.then((h) => h.remove())
    }
  }, [])

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
        nudge(NUDGE_PIXELS)
        break
      case 'ArrowLeft':
        e.preventDefault()
        nudge(-NUDGE_PIXELS)
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
      className={`prompter${nativeCam && camera.recording ? ' is-rec-compact' : ''}`}
      aria-label="Modo teleprompter"
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      {camera.status === 'on' && (
        <>
          {!nativeCam && (
          <video
            ref={camera.attach}
            className="prompter-camera"
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />
          )}
          <div className="prompter-scrim" aria-hidden="true" />
        </>
      )}

      {camera.recording && (
        <div className="prompter-rec" aria-live="polite">
          <span className="rec-dot" aria-hidden="true" /> REC {formatTime(camera.seconds)}
        </div>
      )}

      {nativeCam?.notice && (
        <button type="button" className="prompter-notice" onClick={nativeCam.dismissNotice}>
          {nativeCam.notice} <span aria-hidden="true">✕</span>
        </button>
      )}

      {camera.error && (
        <p className="prompter-cam-error" role="alert">
          {camera.error}
        </p>
      )}

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

        <div className="control-cluster is-essential">
          <button
            type="button"
            className={`btn rec-hide${camera.status === 'on' ? ' btn-rec' : ''}`}
            onClick={toggleCamera}
            aria-pressed={camera.status === 'on'}
            disabled={camera.status === 'requesting'}
          >
            {camera.status === 'on' ? '📷 Câmera ligada' : camera.status === 'requesting' ? 'Abrindo…' : '📷 Câmera'}
          </button>
          {camera.status === 'on' && (
            <button
              type="button"
              className={`btn ${camera.recording ? 'btn-rec' : 'btn-primary'}`}
              onClick={toggleRecording}
            >
              {camera.recording ? (nativeCam ? '⏹ Parar e salvar' : '⏹ Parar e baixar') : '⏺ Gravar'}
            </button>
          )}
          {nativeCam && camera.status === 'on' && (
            <>
              <button
                type="button"
                className="btn btn-icon rec-hide"
                onClick={() => void nativeCam.flip()}
                disabled={camera.recording}
                aria-label={nativeCam.facing === 'front' ? 'Usar câmera traseira' : 'Usar câmera frontal'}
                title="Virar câmera"
              >
                🔄
              </button>
              <select
                className="quality-select rec-hide"
                value={nativeCam.quality}
                disabled={camera.recording}
                onChange={(e) => void nativeCam.setQuality(e.target.value as VideoQuality)}
                aria-label="Qualidade do vídeo"
              >
                {nativeCam.qualities.map((q) => (
                  <option key={q} value={q}>
                    {nativeCam.qualityLabel[q]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="control-cluster is-essential">
          <button type="button" className="btn rec-hide" onClick={handleRestart} aria-label="Reiniciar do topo">
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
