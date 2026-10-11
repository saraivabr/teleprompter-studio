import { isNativeApp } from './native-camera'

/** No APK a interface roda local e fala com a API publicada. */
const NATIVE_API_ORIGIN = 'https://roteiros.saraiva.ai'
const PASSWORD_KEY = 'roteiro-studio:api-password'

function readPassword(): string | null {
  try {
    return localStorage.getItem(PASSWORD_KEY)
  } catch {
    return null
  }
}

function authHeaders(): Record<string, string> {
  const password = readPassword()
  return isNativeApp && password ? { Authorization: `Basic ${btoa(`app:${password}`)}` } : {}
}

/**
 * fetch para a API do Roteiro Studio. No APK, um 401 pede a senha do
 * site uma vez, guarda no aparelho e repete a chamada.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = isNativeApp ? `${NATIVE_API_ORIGIN}${path}` : path
  const send = () =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...authHeaders() } })

  const response = await send()
  if (response.status !== 401 || !isNativeApp) return response

  const password = window.prompt('Senha do Roteiro Studio (a mesma do site):')
  if (!password) return response
  try {
    localStorage.setItem(PASSWORD_KEY, password)
  } catch {
    // sem storage: usa só nesta chamada
  }
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      Authorization: `Basic ${btoa(`app:${password}`)}`,
    },
  })
}
