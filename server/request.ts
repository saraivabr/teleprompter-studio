// Validação e montagem da mensagem do usuário — compartilhado entre o
// servidor Express (local) e o Worker da Cloudflare (produção).

export const MAX_IDEA_LENGTH = 12_000

export const VALID_PLATFORMS = [
  'Reels',
  'TikTok',
  'YouTube Shorts',
  'YouTube longo',
  'Aula',
  'Podcast',
] as const

export const VALID_DURATIONS = [
  '30 a 60 segundos',
  '1 a 3 minutos',
  '3 a 5 minutos',
  '5 a 10 minutos',
] as const

export const VALID_COVERS = ['Tema universal', 'Tema do momento', 'Cultura pop'] as const

export type Platform = (typeof VALID_PLATFORMS)[number]
export type Duration = (typeof VALID_DURATIONS)[number]
export type Cover = (typeof VALID_COVERS)[number]

export interface GenerateRequest {
  idea: string
  platform: Platform
  duration: Duration
  moral?: string
  cover?: Cover
  extraNotes?: string
}

export function validateBody(body: unknown): GenerateRequest | string {
  if (typeof body !== 'object' || body === null) return 'Corpo da requisição inválido.'
  const { idea, platform, duration, moral, cover, extraNotes } = body as Record<string, unknown>

  if (typeof idea !== 'string' || idea.trim().length === 0) {
    return 'Descreva a ideia ou tema do vídeo.'
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return `A ideia é longa demais (máximo de ${MAX_IDEA_LENGTH} caracteres).`
  }
  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    return 'Plataforma inválida.'
  }
  if (!VALID_DURATIONS.includes(duration as Duration)) {
    return 'Duração inválida.'
  }
  if (moral !== undefined && typeof moral !== 'string') {
    return 'Moral da história inválida.'
  }
  if (typeof moral === 'string' && moral.length > 2_000) {
    return 'A moral da história é longa demais.'
  }
  if (cover !== undefined && !VALID_COVERS.includes(cover as Cover)) {
    return 'Capa de tema inválida.'
  }
  if (extraNotes !== undefined && typeof extraNotes !== 'string') {
    return 'Observações extras inválidas.'
  }
  if (typeof extraNotes === 'string' && extraNotes.length > 4_000) {
    return 'As observações extras são longas demais.'
  }

  return {
    idea: idea.trim(),
    platform: platform as Platform,
    duration: duration as Duration,
    moral: typeof moral === 'string' && moral.trim() ? moral.trim() : undefined,
    cover: cover as Cover | undefined,
    extraNotes: typeof extraNotes === 'string' && extraNotes.trim() ? extraNotes.trim() : undefined,
  }
}

export function buildUserMessage({
  idea,
  platform,
  duration,
  moral,
  cover,
  extraNotes,
}: GenerateRequest): string {
  const lines = [
    `PLATAFORMA: ${platform}`,
    `DURAÇÃO ALVO: ${duration}`,
    '',
    'TEMA / IDEIA BRUTA:',
    idea,
  ]
  if (moral) {
    lines.push('', 'MORAL DA HISTÓRIA (aponte o roteiro sutilmente para isto):', moral)
  }
  if (cover) {
    lines.push(
      '',
      `CAPA DO TEMA: ${cover} — abra o roteiro chamando atenção com um tema desse tipo antes de entrar no assunto.`,
    )
  }
  if (extraNotes) {
    lines.push('', 'OBSERVAÇÕES ADICIONAIS:', extraNotes)
  }
  lines.push('', 'Crie o roteiro completo seguindo todas as regras.')
  return lines.join('\n')
}
