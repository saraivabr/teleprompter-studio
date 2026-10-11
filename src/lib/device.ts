import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from './native-camera'

/** Toque físico curto (só no APK; no navegador não faz nada). */
export function haptic(strength: 'light' | 'medium' | 'heavy' = 'light') {
  if (!isNativeApp) return
  const style =
    strength === 'heavy' ? ImpactStyle.Heavy : strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light
  void Haptics.impact({ style }).catch(() => {})
}

/** APK: barra de status transparente sobre o app, ícones claros (tema escuro). */
export function setupSystemBars() {
  if (!isNativeApp) return
  void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  void StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {})
}
