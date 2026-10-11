import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type Facing = 'front' | 'back'
export type VideoQuality = 'UHD' | 'FHD' | 'HD' | 'SD'
export type RemoteKey =
  | 'volumeUp'
  | 'volumeDown'
  | 'playPause'
  | 'next'
  | 'previous'
  | 'pageDown'
  | 'pageUp'

export interface CameraState {
  facing: Facing
  quality: VideoQuality
  qualities: VideoQuality[]
  hasMicrophone: boolean
}

export interface RecordingResult {
  saved: boolean
  uri: string
  durationMs: number
  bytes: number
  album: string
  error?: string
}

interface NativeCameraPlugin {
  start(options: { facing: Facing; quality: VideoQuality }): Promise<CameraState>
  configure(options: { facing?: Facing; quality?: VideoQuality }): Promise<CameraState>
  stop(): Promise<void>
  startRecording(): Promise<{ name: string }>
  stopRecording(): Promise<RecordingResult>
  setRemoteEnabled(options: { enabled: boolean }): Promise<void>
  addListener(
    event: 'remoteKey',
    handler: (data: { key: RemoteKey }) => void,
  ): Promise<PluginListenerHandle>
}

/** true quando roda dentro do APK (Capacitor), false no navegador. */
export const isNativeApp = Capacitor.isNativePlatform()

/** Plugin nativo de câmera/gravação (CameraX) — só existe no APK. */
export const NativeCamera = registerPlugin<NativeCameraPlugin>('NativeCamera')

export const QUALITY_LABEL: Record<VideoQuality, string> = {
  UHD: '4K',
  FHD: '1080p',
  HD: '720p',
  SD: '480p',
}
