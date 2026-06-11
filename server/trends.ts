// Busca os assuntos em alta no Google Trends (Brasil) via feed RSS público.
// Usa apenas fetch + parsing de string, então roda tanto no Node (Express)
// quanto no Worker da Cloudflare.

const TRENDS_RSS = 'https://trends.google.com/trending/rss'
export const TRENDS_GEO = 'BR'

export interface TrendTopic {
  title: string
  traffic: string | null
  news: string[]
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim()
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re)
  return m ? decodeEntities(m[1]) : null
}

const SENTINEL_TITLE = /^(daily search trends|google trends)/i

export function parseTrendsRss(xml: string, limit = 10): TrendTopic[] {
  const items = xml.split('<item>').slice(1)
  const topics: TrendTopic[] = []
  for (const raw of items) {
    const block = raw.split('</item>')[0]
    const title = firstMatch(block, /<title>([^<]*)<\/title>/)
    // Ignora linha vazia ou o título do canal vazado por feed malformado.
    if (!title || SENTINEL_TITLE.test(title)) continue
    const traffic = firstMatch(block, /<ht:approx_traffic>([^<]*)</)
    const news = [...block.matchAll(/<ht:news_item_title>([^<]*)</g)]
      .map((m) => decodeEntities(m[1]))
      .filter((t) => t.length > 0)
      .slice(0, 3)
    topics.push({ title, traffic, news })
    if (topics.length >= limit) break
  }
  return topics
}

export async function fetchTrends(signal?: AbortSignal): Promise<TrendTopic[]> {
  // Sem signal externo, aplica um teto de 8s para não deixar a chamada pendurada.
  const res = await fetch(`${TRENDS_RSS}?geo=${TRENDS_GEO}`, {
    signal: signal ?? AbortSignal.timeout(8_000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  })
  if (!res.ok) throw new Error(`Google Trends respondeu ${res.status}`)
  const topics = parseTrendsRss(await res.text())
  if (topics.length === 0) throw new Error('Feed de tendências vazio')
  return topics
}
