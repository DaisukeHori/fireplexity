/**
 * 内蔵検索エンジン - DuckDuckGo HTMLスクレイピング
 * Firecrawlの検索機能を内包した実装
 * APIキー不要で動作します
 */

import { JSDOM } from 'jsdom'

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

// User Agentsのリスト
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
]

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// DuckDuckGoのURLエンコードを解除
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

// Web検索結果を抽出
function extractWebResults(document: Document, seenUrls: Set<string>): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const blocks = Array.from(document.querySelectorAll('.result.web-result'))

  for (const block of blocks) {
    const titleLink = block.querySelector('.result__a') as HTMLAnchorElement | null
    const snippet = block.querySelector('.result__snippet')

    if (!titleLink || !snippet) continue

    const rawUrl = titleLink.href?.trim()
    const title = titleLink.textContent?.trim()
    const description = snippet.textContent?.trim()

    if (rawUrl && title) {
      const url = cleanUrl(rawUrl)
      if (!seenUrls.has(url) && url.startsWith('http')) {
        seenUrls.add(url)
        results.push({ url, title, description })
      }
    }
  }

  return results
}

// ニュース検索
async function searchNews(query: string, numResults: number = 5): Promise<NewsSearchResult[]> {
  try {
    const userAgent = getRandomUserAgent()
    const params = new URLSearchParams({
      q: query,
      iar: 'news',
      ia: 'news'
    })

    const response = await fetch(`https://html.duckduckgo.com/html?${params.toString()}`, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      },
    })

    if (!response.ok) return []

    const html = await response.text()
    const dom = new JSDOM(html)
    const document = dom.window.document

    const results: NewsSearchResult[] = []
    const blocks = Array.from(document.querySelectorAll('.result'))

    for (const block of blocks) {
      if (results.length >= numResults) break

      const titleLink = block.querySelector('.result__a') as HTMLAnchorElement | null
      const snippet = block.querySelector('.result__snippet')

      if (!titleLink) continue

      const rawUrl = titleLink.href?.trim()
      const title = titleLink.textContent?.trim()
      const description = snippet?.textContent?.trim()

      if (rawUrl && title) {
        const url = cleanUrl(rawUrl)
        if (url.startsWith('http')) {
          results.push({
            url,
            title,
            description,
            source: new URL(url).hostname.replace('www.', ''),
          })
        }
      }
    }

    return results
  } catch (error) {
    console.error('News search error:', error)
    return []
  }
}

// 画像検索
async function searchImages(query: string, numResults: number = 6): Promise<ImageSearchResult[]> {
  try {
    const userAgent = getRandomUserAgent()

    // DuckDuckGo画像検索のvqdトークンを取得
    const tokenResponse = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
      headers: {
        'User-Agent': userAgent,
      },
    })

    const tokenHtml = await tokenResponse.text()
    const vqdMatch = tokenHtml.match(/vqd=["']([^"']+)["']/) || tokenHtml.match(/vqd=(\d+-\d+)/)

    if (!vqdMatch) {
      return []
    }

    const vqd = vqdMatch[1]

    // 画像検索APIを呼び出し
    const imageParams = new URLSearchParams({
      q: query,
      vqd: vqd,
      l: 'ja-jp',
      o: 'json',
      f: ',,,,,',
      p: '1',
    })

    const imageResponse = await fetch(`https://duckduckgo.com/i.js?${imageParams.toString()}`, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
    })

    if (!imageResponse.ok) return []

    const imageData = await imageResponse.json()
    const results: ImageSearchResult[] = []

    if (imageData.results && Array.isArray(imageData.results)) {
      for (const item of imageData.results) {
        if (results.length >= numResults) break

        if (item.image && item.url) {
          results.push({
            url: item.url,
            title: item.title || 'Untitled',
            imageUrl: item.image,
            source: item.source || new URL(item.url).hostname,
            width: item.width,
            height: item.height,
          })
        }
      }
    }

    return results
  } catch (error) {
    console.error('Image search error:', error)
    return []
  }
}

// メインの検索関数
export async function search(
  query: string,
  options: {
    numResults?: number
    includeNews?: boolean
    includeImages?: boolean
    lang?: string
    country?: string
  } = {}
): Promise<SearchResponse> {
  const {
    numResults = 6,
    includeNews = true,
    includeImages = true,
    lang = 'ja',
    country = 'jp',
  } = options

  try {
    const userAgent = getRandomUserAgent()

    // Web検索パラメータ
    const params = new URLSearchParams({
      q: query,
      kp: '1',
      kl: `${country.toLowerCase()}-${lang.toLowerCase()}`,
    })

    // Web検索を実行
    const response = await fetch(`https://html.duckduckgo.com/html?${params.toString()}`, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      },
    })

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`)
    }

    const html = await response.text()
    const dom = new JSDOM(html)
    const document = dom.window.document

    // アンチボット検出
    const anomalyModal = document.querySelector('.anomaly-modal__modal')
    if (anomalyModal) {
      throw new Error('検索がブロックされました。しばらく待ってから再試行してください。')
    }

    const seenUrls = new Set<string>()
    const webResults = extractWebResults(document, seenUrls).slice(0, numResults)

    // 並列でニュースと画像を検索
    const [newsResults, imageResults] = await Promise.all([
      includeNews ? searchNews(query, 5) : Promise.resolve([]),
      includeImages ? searchImages(query, 6) : Promise.resolve([]),
    ])

    return {
      web: webResults,
      news: newsResults,
      images: imageResults,
    }
  } catch (error) {
    console.error('Search error:', error)
    return { web: [], news: [], images: [] }
  }
}
