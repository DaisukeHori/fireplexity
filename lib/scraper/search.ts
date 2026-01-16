/**
 * 内蔵検索エンジン
 * Brave Search API（推奨）またはDuckDuckGoフォールバック
 */

import * as cheerio from 'cheerio'

// 検索結果の型定義
export interface WebSearchResult {
  url: string
  title: string
  description?: string
}

export interface NewsSearchResult {
  url: string
  title: string
  description?: string
  source?: string
  date?: string
  imageUrl?: string
}

export interface ImageSearchResult {
  url: string
  title: string
  imageUrl: string
  source?: string
  width?: number
  height?: number
}

export interface SearchResponse {
  web?: WebSearchResult[]
  news?: NewsSearchResult[]
  images?: ImageSearchResult[]
}

// ============================================
// Brave Search API
// ============================================

async function braveWebSearch(
  query: string,
  apiKey: string,
  numResults: number = 6
): Promise<WebSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      count: numResults.toString(),
    })

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!response.ok) {
      console.warn(`[Brave Web] ${response.status}: ${query}`)
      return []
    }

    const data = await response.json()
    const results: WebSearchResult[] = []

    if (data.web?.results) {
      for (const item of data.web.results) {
        results.push({
          url: item.url,
          title: item.title,
          description: item.description,
        })
      }
    }

    return results.slice(0, numResults)
  } catch (error) {
    console.warn(`[Brave Web] Error: ${query}`, (error as Error).message || error)
    return []
  }
}

async function braveNewsSearch(
  query: string,
  apiKey: string,
  numResults: number = 5
): Promise<NewsSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      count: numResults.toString(),
    })

    const response = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!response.ok) {
      console.warn(`[Brave News] ${response.status}: ${query}`)
      return []
    }

    const data = await response.json()
    const results: NewsSearchResult[] = []

    if (data.results) {
      for (const item of data.results) {
        results.push({
          url: item.url,
          title: item.title,
          description: item.description,
          source: item.source,
          date: item.age,
        })
      }
    }

    return results.slice(0, numResults)
  } catch (error) {
    console.warn(`[Brave News] Error: ${query}`, (error as Error).message || error)
    return []
  }
}

async function braveImageSearch(
  query: string,
  apiKey: string,
  numResults: number = 6
): Promise<ImageSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      count: numResults.toString(),
    })

    const response = await fetch(`https://api.search.brave.com/res/v1/images/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!response.ok) {
      console.warn(`[Brave Image] ${response.status}: ${query}`)
      return []
    }

    const data = await response.json()
    const results: ImageSearchResult[] = []

    if (data.results) {
      for (const item of data.results) {
        results.push({
          url: item.url,
          title: item.title || 'Untitled',
          imageUrl: item.thumbnail?.src || item.url,
          source: item.source,
          width: item.width,
          height: item.height,
        })
      }
    }

    return results.slice(0, numResults)
  } catch (error) {
    console.warn(`[Brave Image] Error: ${query}`, (error as Error).message || error)
    return []
  }
}

// ============================================
// DuckDuckGo (フォールバック)
// ============================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function cleanUrl(href: string): string {
  if (href.includes('uddg=')) {
    try {
      const url = new URL(href, 'https://duckduckgo.com')
      const uddg = url.searchParams.get('uddg')
      return uddg ? decodeURIComponent(uddg) : href
    } catch {
      return href
    }
  }
  return href
}

async function duckDuckGoSearch(
  query: string,
  numResults: number = 6
): Promise<WebSearchResult[]> {
  const userAgent = getRandomUserAgent()
  const params = new URLSearchParams({
    q: query,
    kp: '1',
    kl: 'jp-ja',
  })

  const response = await fetch(`https://html.duckduckgo.com/html?${params.toString()}`, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    },
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  // アンチボット検出
  if ($('.anomaly-modal__modal').length > 0) {
    throw new Error('検索がブロックされました')
  }

  const results: WebSearchResult[] = []
  const seenUrls = new Set<string>()

  $('.result.web-result').each((_, block) => {
    const $block = $(block)
    const titleLink = $block.find('.result__a')
    const snippet = $block.find('.result__snippet')

    const rawUrl = titleLink.attr('href')?.trim()
    const title = titleLink.text()?.trim()
    const description = snippet.text()?.trim()

    if (rawUrl && title) {
      const url = cleanUrl(rawUrl)
      if (!seenUrls.has(url) && url.startsWith('http')) {
        seenUrls.add(url)
        results.push({ url, title, description })
      }
    }
  })

  return results.slice(0, numResults)
}

// ============================================
// メイン検索関数
// ============================================

export async function search(
  query: string,
  options: {
    numResults?: number
    includeNews?: boolean
    includeImages?: boolean
    braveApiKey?: string
  } = {}
): Promise<SearchResponse> {
  const {
    numResults = 6,
    includeNews = true,
    includeImages = true,
    braveApiKey,
  } = options

  // Brave Search APIを優先使用
  if (braveApiKey) {
    try {
      const [webResults, newsResults, imageResults] = await Promise.all([
        braveWebSearch(query, braveApiKey, numResults),
        includeNews ? braveNewsSearch(query, braveApiKey, 5) : Promise.resolve([]),
        includeImages ? braveImageSearch(query, braveApiKey, 6) : Promise.resolve([]),
      ])

      return {
        web: webResults,
        news: newsResults,
        images: imageResults,
      }
    } catch (error) {
      console.warn('[Brave] Unexpected error:', (error as Error).message || error)
      return { web: [], news: [], images: [] }
    }
  }

  // DuckDuckGoフォールバック（APIキーがない場合のみ）
  try {
    const webResults = await duckDuckGoSearch(query, numResults)
    return {
      web: webResults,
      news: [],
      images: [],
    }
  } catch (error) {
    console.warn('[DuckDuckGo] Error:', (error as Error).message || error)
    return { web: [], news: [], images: [] }
  }
}
