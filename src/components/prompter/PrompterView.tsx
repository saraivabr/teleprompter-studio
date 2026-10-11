import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonToast,
  IonToggle,
} from '@ionic/react'
import {
  cameraReverseOutline,
  close as closeIcon,
  optionsOutline,
  pause,
  play,
  refresh,
  videocam,
} from 'ionicons/icons'
import { haptic } from '../../lib/device'
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
const TOAST_MS = 8000
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

  const modalRef = useRef<HTMLIonModalElement>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
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
    haptic('medium')
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

  // APK: abre já com a câmera ligada, como um app de câmera.
  useEffect(() => {
    if (nativeCam) void camera.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        haptic('heavy')
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

  const close = () => void modalRef.current?.dismiss()

  const onKeyDown = (e: KeyboardEvent) => {
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

  // Teclado/controle que fala como teclado (espaço, setas…). O IonModal não repassa onKeyDown,
  // então escutamos na janela; com a folha de opções aberta, as teclas ficam com ela.
  const keyRef = useRef(onKeyDown)
  keyRef.current = onKeyDown
  const optionsOpenRef = useRef(false)
  optionsOpenRef.current = optionsOpen
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (optionsOpenRef.current) return
      if (e.key === 'Escape') return // o IonModal já fecha com Escape
      keyRef.current(e)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const transform = `${mirrored ? 'scaleX(-1) ' : ''}${flipped ? 'scaleY(-1)' : ''}`.trim()

  const cameraOn = camera.status === 'on'
  const rolling = running || countdown !== null
  const driveButtons =
    nativeCam?.lastVideo && !camera.recording
      ? [{ text: 'Enviar pro Drive', handler: () => void nativeCam.sendToDrive() }]
      : []

  return (
    <IonModal
      ref={modalRef}
      isOpen
      className={`prompter-modal${nativeCam && camera.recording ? ' is-rec-compact' : ''}`}
      onDidPresent={() => playRef.current?.focus()}
      onDidDismiss={onClose}
      aria-label="Modo teleprompter"
    >
      <div className="prompter">
        {cameraOn && (
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

        <div className="prompter-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>

        <header className="prompter-topbar">
          <button type="button" className="cam-btn rec-hide" onClick={close} aria-label="Sair do teleprompter">
            <IonIcon icon={closeIcon} />
          </button>
          {camera.recording ? (
            <div className="prompter-rec" aria-live="polite">
              <span className="rec-dot" aria-hidden="true" /> {formatTime(camera.seconds)}
            </div>
          ) : (
            <span className="prompter-topbar-title">
              {nativeCam && cameraOn
                ? `${nativeCam.qualityLabel[nativeCam.quality]}${nativeCam.hdr ? ' · HDR' : ''}`
                : 'Teleprompter'}
            </span>
          )}
          <button
            type="button"
            className="cam-btn rec-hide"
            onClick={() => setOptionsOpen(true)}
            aria-label="Opções de câmera e texto"
          >
            <IonIcon icon={optionsOutline} />
          </button>
        </header>

        {camera.error && (
          <p className="prompter-cam-error" role="alert">
            {camera.error}
          </p>
        )}

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

        <footer className="prompter-bottombar">
          <button
            ref={playRef}
            type="button"
            className={`cam-btn cam-btn-lg${rolling ? ' is-on' : ''}`}
            onClick={togglePlay}
            aria-label={rolling ? 'Pausar rolagem' : atEnd ? 'Recomeçar do topo' : 'Rolar texto'}
          >
            <IonIcon icon={rolling ? pause : atEnd ? refresh : play} />
          </button>

          {cameraOn ? (
            <button
              type="button"
              className={`shutter${camera.recording ? ' is-recording' : ''}`}
              onClick={toggleRecording}
              aria-label={camera.recording ? 'Parar e salvar' : 'Gravar'}
            >
              <span className="shutter-core" />
            </button>
          ) : (
            <button
              type="button"
              className="shutter shutter-off"
              onClick={toggleCamera}
              disabled={camera.status === 'requesting'}
              aria-label="Ligar câmera"
            >
              <IonIcon icon={videocam} />
            </button>
          )}

          {nativeCam && cameraOn ? (
            <button
              type="button"
              className="cam-btn cam-btn-lg rec-hide"
              onClick={() => {
                haptic('light')
                void nativeCam.flip()
              }}
              disabled={camera.recording}
              aria-label={nativeCam.facing === 'front' ? 'Usar câmera traseira' : 'Usar câmera frontal'}
            >
              <IonIcon icon={cameraReverseOutline} />
            </button>
          ) : (
            <button
              type="button"
              className="cam-btn cam-btn-lg rec-hide"
              onClick={handleRestart}
              aria-label="Reiniciar do topo"
            >
              <IonIcon icon={refresh} />
            </button>
          )}
        </footer>
      </div>

      <IonModal
        className="prompter-options"
        isOpen={optionsOpen}
        onDidDismiss={() => setOptionsOpen(false)}
        breakpoints={[0, 0.4, 0.8]}
        initialBreakpoint={0.4}
      >
        <IonContent>
          <IonList lines="full">
            <IonListHeader>
              <IonLabel>Câmera</IonLabel>
            </IonListHeader>
            <IonItem>
              <IonToggle
                checked={cameraOn}
                onIonChange={() => toggleCamera()}
                disabled={camera.status === 'requesting' || camera.recording}
              >
                Câmera ligada
              </IonToggle>
            </IonItem>
            {nativeCam && cameraOn && (
              <>
                <IonItem lines="none">
                  <IonLabel>Qualidade</IonLabel>
                </IonItem>
                <IonItem>
                  <IonSegment
                    value={nativeCam.quality}
                    disabled={camera.recording}
                    onIonChange={(e) => void nativeCam.setQuality(e.detail.value as VideoQuality)}
                  >
                    {nativeCam.qualities.map((q) => (
                      <IonSegmentButton key={q} value={q}>
                        <IonLabel>{nativeCam.qualityLabel[q]}</IonLabel>
                      </IonSegmentButton>
                    ))}
                  </IonSegment>
                </IonItem>
                {nativeCam.hdrSupported && (
                  <IonItem>
                    <IonToggle
                      checked={nativeCam.hdr}
                      disabled={camera.recording}
                      onIonChange={() => void nativeCam.toggleHdr()}
                    >
                      <IonLabel>
                        HDR
                        <p>Mais detalhe na luz e na sombra</p>
                      </IonLabel>
                    </IonToggle>
                  </IonItem>
                )}
                <IonItem
                  button
                  detail={false}
                  disabled={camera.recording}
                  onClick={() => void nativeCam.flip()}
                >
                  <IonIcon slot="start" icon={cameraReverseOutline} />
                  <IonLabel>{nativeCam.facing === 'front' ? 'Usar câmera traseira' : 'Usar câmera frontal'}</IonLabel>
                </IonItem>
              </>
            )}
            {nativeCam && (
              <IonItem>
                <IonToggle
                  checked={nativeCam.autoDrive}
                  onIonChange={(e) => nativeCam.setAutoDrive(e.detail.checked)}
                >
                  <IonLabel>
                    Enviar pro Drive ao terminar
                    <p>Sobe o vídeo assim que a gravação para</p>
                  </IonLabel>
                </IonToggle>
              </IonItem>
            )}

            <IonListHeader>
              <IonLabel>Texto</IonLabel>
            </IonListHeader>
            <IonItem>
              <IonRange
                label={`Velocidade · ${speed}`}
                labelPlacement="stacked"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={speed}
                onIonInput={(e) => setSpeed(e.detail.value as number)}
              />
            </IonItem>
            <IonItem>
              <IonRange
                label={`Tamanho da letra · ${fontSize}`}
                labelPlacement="stacked"
                min={FONT_MIN}
                max={FONT_MAX}
                step={FONT_STEP}
                value={fontSize}
                onIonInput={(e) => setFontSize(e.detail.value as number)}
              />
            </IonItem>
            <IonItem>
              <IonToggle checked={mirrored} onIonChange={(e) => setMirrored(e.detail.checked)}>
                <IonLabel>
                  Espelhar texto
                  <p>Para vidro de teleprompter</p>
                </IonLabel>
              </IonToggle>
            </IonItem>
            <IonItem>
              <IonToggle checked={flipped} onIonChange={(e) => setFlipped(e.detail.checked)}>
                Inverter na vertical
              </IonToggle>
            </IonItem>
            <IonItem button detail={false} lines="none" onClick={handleRestart}>
              <IonIcon slot="start" icon={refresh} />
              <IonLabel>Voltar o texto para o início</IonLabel>
            </IonItem>
          </IonList>
        </IonContent>
      </IonModal>

      <IonToast
        isOpen={Boolean(nativeCam?.notice)}
        message={nativeCam?.notice ?? ''}
        // Com o botão do Drive, o aviso espera o toque; sem ele, some sozinho.
        duration={driveButtons.length > 0 ? 0 : TOAST_MS}
        position="top"
        onDidDismiss={() => nativeCam?.dismissNotice()}
        buttons={[...driveButtons, { text: 'OK', role: 'cancel' }]}
      />
    </IonModal>
  )
}
