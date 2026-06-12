import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'off' | 'requesting' | 'on' | 'error'

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

/**
 * Gerencia a câmera (getUserMedia) e a gravação (MediaRecorder) do
 * teleprompter. A gravação captura só o stream da câmera+microfone —
 * o texto sobreposto é apenas guia de leitura e não entra no vídeo.
 */
export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  /** Ref callback para o <video> de preview. */
  const attach = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStatus('on')
    } catch (e) {
      setStatus('error')
      const name = e instanceof DOMException ? e.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Permissão de câmera/microfone negada. Libere o acesso no navegador.'
          : name === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste dispositivo.'
            : 'Não foi possível acessar a câmera.',
      )
    }
  }, [])

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const stop = useCallback(() => {
    stopRecording()
    stopTimer()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('off')
    setRecording(false)
    setSeconds(0)
  }, [stopRecording, stopTimer])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mimeType = pickMimeType()
    chunksRef.current = []
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const type = rec.mimeType || 'video/webm'
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roteiro-${Date.now()}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setRecording(false)
      stopTimer()
    }
    rec.start()
    recorderRef.current = rec
    setRecording(true)
    setSeconds(0)
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [stopTimer])

  // Cleanup ao desmontar: para gravação, timer e câmera (apaga a luz da webcam).
  useEffect(() => {
    return () => {
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
      if (timerRef.current !== null) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return { status, error, recording, seconds, start, stop, startRecording, stopRecording, attach }
}
