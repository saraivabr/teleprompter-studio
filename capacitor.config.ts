import type { CapacitorConfig } from '@capacitor/cli'

// App Android do Roteiro Studio: empacota o mesmo frontend (dist/) e
// acrescenta câmera/gravação nativas via plugin NativeCamera (CameraX).
const config: CapacitorConfig = {
  appId: 'ai.saraiva.roteiros',
  appName: 'Roteiro Studio',
  webDir: 'dist',
  android: {
    // A WebView precisa ser transparente para a câmera nativa aparecer por trás.
    backgroundColor: '#00000000',
  },
}

export default config
