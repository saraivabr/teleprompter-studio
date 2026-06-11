import type { SavedScript } from './types'

const STORAGE_KEY = 'teleprompter-studio:scripts:v1'

function readAll(): SavedScript[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is SavedScript =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedScript).id === 'string' &&
        typeof (item as SavedScript).raw === 'string',
    )
  } catch {
    return []
  }
}

function writeAll(scripts: SavedScript[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts))
}

export function listScripts(): SavedScript[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt)
}

export function saveScript(script: Omit<SavedScript, 'id' | 'createdAt'>): SavedScript {
  const entry: SavedScript = {
    ...script,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  writeAll([entry, ...readAll()])
  return entry
}

export function deleteScript(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id))
}
