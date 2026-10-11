import { useCallback, useEffect, useRef, useState } from 'react'
import type { CameraStatus } from './useCamera'
import {
  NativeCamera,
  QUALITY_LABEL,
  type Facing,
  type RecordingResult,
  type VideoQuality,
} from '../lib/native-camera'

const PREFS_KEY = 'roteiro-studio:camera'
const NATIVE_CAM_CLASS = 'native-cam'

interface CameraPrefs {
  facing: Facing
  quality: VideoQuality
  hdr: boolean
  autoDrive: boolean
}

const DEFAULT_PREFS: CameraPrefs = { facing: 'front', quality: 'UHD', hdr: false, autoDrive: false }

function loadPrefs(): CameraPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '') as Partial<CameraPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: CameraPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // preferências são conveniência; sem storage segue com o padrão
  }
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function savedMessage(result: RecordingResult): string {
  if (!result.saved) return `A gravação falhou${result.error ? ` (${result.error})` : ''}.`
  const minutes = Math.floor(result.durationMs / 60000)
  const seconds = Math.round((result.durationMs % 60000) / 1000)
  const megabytes = (result.bytes / 1_048_576).toFixed(0)
  return `Vídeo salvo na galeria (${result.album}) — ${minutes}:${String(seconds).padStart(2, '0')}, ${megabytes} MB.`
}

/**
 * Câmera e gravação nativas do APK (CameraX). O preview é desenhado pelo
 * Android atrás da WebView; aqui só ligamos a transparência da página.
 */
export function useNativeCamera() {
  const [status, setStatus] = useState<CameraStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [prefs, setPrefs] = useState<CameraPrefs>(loadPrefs)
  const [qualities, setQualities] = useState<VideoQuality[]>([])
  const [hdrSupported, setHdrSupported] = useState(false)
  const [lastVideo, setLastVideo] = useState<{ uri: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const updatePrefs = useCallback((next: CameraPrefs) => {
    setPrefs(next)
    savePrefs(next)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('requesting')
    try {
      const state = await NativeCamera.start(prefs)
      document.documentElement.classList.add(NATIVE_CAM_CLASS)
      setQualities(state.qualities)
      setHdrSupported(state.hdrSupported)
      updatePrefs({ ...prefs, facing: state.facing, quality: state.quality, hdr: state.hdr })
      if (!state.hasMicrophone) setNotice('Microfone sem permissão: o vídeo vai sair sem som.')
      setStatus('on')
    } catch (e) {
      setStatus('error')
      setError(errorMessage(e, 'Não foi possível abrir a câmera.'))
    }
  }, [prefs, updatePrefs])

  const stop = useCallback(() => {
    stopTimer()
    document.documentElement.classList.remove(NATIVE_CAM_CLASS)
    setStatus('off')
    setRecording(false)
    setSeconds(0)
    void NativeCamera.stop()
  }, [stopTimer])

  const configure = useCallback(
    async (next: Partial<CameraPrefs>) => {
      try {
        const state = await NativeCamera.configure(next)
        setQualities(state.qualities)
        setHdrSupported(state.hdrSupported)
        updatePrefs({ ...prefs, facing: state.facing, quality: state.quality, hdr: state.hdr })
      } catch (e) {
        setNotice(errorMessage(e, 'Não foi possível trocar a câmera.'))
      }
    },
    [prefs, updatePrefs],
  )

  const flip = useCallback(
    () => configure({ facing: prefs.facing === 'front' ? 'back' : 'front' }),
    [configure, prefs.facing],
  )

  const setQuality = useCallback((quality: VideoQuality) => configure({ quality }), [configure])

  const toggleHdr = useCallback(() => configure({ hdr: !prefs.hdr }), [configure, prefs.hdr])

  const setAutoDrive = useCallback(
    (autoDrive: boolean) => updatePrefs({ ...prefs, autoDrive }),
    [prefs, updatePrefs],
  )

  const sendVideoToDrive = useCallback(async (uri: string) => {
    try {
      await NativeCamera.sendToDrive({ uri })
    } catch (e) {
      setNotice(errorMessage(e, 'Não foi possível abrir o Google Drive.'))
    }
  }, [])

  const sendToDrive = useCallback(async () => {
    if (lastVideo) await sendVideoToDrive(lastVideo.uri)
  }, [lastVideo, sendVideoToDrive])

  const startRecording = useCallback(async () => {
    try {
      await NativeCamera.startRecording()
      setNotice(null)
      setRecording(true)
      setSeconds(0)
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e) {
      setNotice(errorMessage(e, 'Não foi possível iniciar a gravação.'))
    }
  }, [])

  const stopRecording = useCallback(async () => {
    stopTimer()
    setRecording(false)
    try {
      const result = await NativeCamera.stopRecording()
      setNotice(savedMessage(result))
      if (!result.saved) return
      setLastVideo({ uri: result.uri })
      if (prefs.autoDrive) await sendVideoToDrive(result.uri)
    } catch (e) {
      setNotice(errorMessage(e, 'Não foi possível finalizar a gravação.'))
    }
  }, [stopTimer, prefs.autoDrive, sendVideoToDrive])

  // Ao sair do teleprompter: finaliza gravação (o arquivo é salvo) e solta a câmera.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
      document.documentElement.classList.remove(NATIVE_CAM_CLASS)
      void NativeCamera.stop()
    }
  }, [])

  return {
    native: true as const,
    status,
    error,
    recording,
    seconds,
    start,
    stop,
    startRecording,
    stopRecording,
    attach: () => {},
    facing: prefs.facing,
    quality: prefs.quality,
    qualities,
    qualityLabel: QUALITY_LABEL,
    flip,
    setQuality,
    hdr: prefs.hdr && hdrSupported,
    hdrSupported,
    toggleHdr,
    autoDrive: prefs.autoDrive,
    setAutoDrive,
    lastVideo,
    sendToDrive,
    notice,
    dismissNotice: () => setNotice(null),
  }
}
