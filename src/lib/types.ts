export const PLATFORMS = [
  'Reels',
  'TikTok',
  'YouTube Shorts',
  'YouTube longo',
  'Aula',
  'Podcast',
] as const

export const DURATIONS = [
  '30 a 60 segundos',
  '1 a 3 minutos',
  '3 a 5 minutos',
  '5 a 10 minutos',
] as const

export type Platform = (typeof PLATFORMS)[number]
export type Duration = (typeof DURATIONS)[number]

export interface ScriptRequest {
  idea: string
  platform: Platform
  duration: Duration
  extraNotes?: string
}

export interface SavedScript {
  id: string
  createdAt: number
  request: ScriptRequest
  raw: string
}

/* ---- Estrutura do roteiro parseado ---- */

export type ToneDirection = 'up' | 'down' | 'flat'

export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'soft'; value: string }
  | { kind: 'pause'; level: 1 | 2 | 3 }
  | { kind: 'breath' }
  | { kind: 'tone'; direction: ToneDirection }

export interface Line {
  tokens: Token[]
}

export type SectionKind = 'hook' | 'development' | 'closing' | 'other'

export interface Section {
  kind: SectionKind
  label: string
  lines: Line[]
}

export interface ParsedScript {
  title: string | null
  duration: string | null
  sections: Section[]
  hashtags: string[]
  footer: string[]
}
