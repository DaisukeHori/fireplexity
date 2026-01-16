/**
 * 内蔵ウェブスクレイパー
 * Firecrawlのスクレイピング機能を内包した実装
 * Vercel Serverless互換（puppeteer不要）
 */

import { JSDOM } from 'jsdom'
import TurndownService from 'turndown'

// スクレイピング結果の型定義
export interface ScrapeResult {
  url: string
  title: string
  description?: string
  content?: string
  markdown?: string
  favicon?: string
  ogImage?: string
  siteName?: string
}

// 削除するセレクタのリスト
const SELECTORS_TO_REMOVE = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'nav',
  'header',
  'footer',
  'aside',
  '.sidebar',
  '.advertisement',
  '.ads',
  '.ad',
  '.social-share',
  '.comments',
  '.comment',
  '.related-posts',
  '.recommended',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
]

// User Agentsのリスト
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// HTMLをクリーンアップ
function cleanHtml(document: Document): void {
  // 不要な要素を削除
  for (const selector of SELECTORS_TO_REMOVE) {
    try {
      const elements = document.querySelectorAll(selector)
      elements.forEach(el => el.remove())
    } catch {
      // セレクタが無効な場合は無視
    }
  }
}

// メインコンテンツを抽出
function extractMainContent(document: Document): string {
  // メインコンテンツ候補を探す
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '#main',
  ]

  for (const selector of mainSelectors) {
    const element = document.querySelector(selector)
    if (element && element.textContent && element.textContent.trim().length > 100) {
      return element.innerHTML
    }
  }

  // 見つからない場合はbodyを使用
  return document.body?.innerHTML || ''
}

// メタデータを抽出
function extractMetadata(document: Document, url: string): {
  title: string
  description?: string
  favicon?: string
  ogImage?: string
  siteName?: string
} {
  const getMetaContent = (name: string): string | undefined => {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`) as HTMLMetaElement
    return meta?.content
  }

  // タイトル取得
  const title =
    getMetaContent('og:title') ||
    getMetaContent('twitter:title') ||
    document.querySelector('title')?.textContent?.trim() ||
    'Untitled'

  // 説明取得
  const description =
    getMetaContent('og:description') ||
    getMetaContent('twitter:description') ||
    getMetaContent('description')

  // OG画像取得
  const ogImage =
    getMetaContent('og:image') ||
    getMetaContent('twitter:image')

  // サイト名取得
  const siteName =
    getMetaContent('og:site_name') ||
    new URL(url).hostname.replace('www.', '')

  // Favicon取得
  let favicon: string | undefined
  const faviconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]') as HTMLLinkElement
  if (faviconLink?.href) {
    try {
      favicon = new URL(faviconLink.href, url).href
    } catch {
      favicon = undefined
    }
  }
  if (!favicon) {
    try {
      favicon = new URL('/favicon.ico', url).href
    } catch {
      favicon = undefined
    }
  }

  return { title, description, favicon, ogImage, siteName }
}

// HTMLをMarkdownに変換
function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  // カスタムルール追加
  turndownService.addRule('removeImages', {
    filter: 'img',
    replacement: () => '',
  })

  turndownService.addRule('simplifyLinks', {
    filter: 'a',
    replacement: (content, node) => {
      const href = (node as HTMLAnchorElement).getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return content
      }
      return `[${content}](${href})`
    },
  })

  const markdown = turndownService.turndown(html)

  // 連続する空行を削除
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/gm, '')
    .trim()
}

// URLをスクレイピング
export async function scrapeUrl(url: string, options: {
  timeout?: number
  maxContentLength?: number
} = {}): Promise<ScrapeResult | null> {
  const {
    timeout = 10000,
    maxContentLength = 50000,
  } = options

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      console.error(`Unsupported content type for ${url}: ${contentType}`)
      return null
    }

    let html = await response.text()

    // 最大長を超える場合は切り詰め
    if (html.length > maxContentLength) {
      html = html.slice(0, maxContentLength)
    }

    const dom = new JSDOM(html, { url })
    const document = dom.window.document

    // メタデータを抽出
    const metadata = extractMetadata(document, url)

    // HTMLをクリーンアップ
    cleanHtml(document)

    // メインコンテンツを抽出
    const mainContent = extractMainContent(document)

    // Markdownに変換
    const markdown = htmlToMarkdown(mainContent)

    // テキストコンテンツを抽出
    const tempDom = new JSDOM(mainContent)
    const textContent = tempDom.window.document.body?.textContent?.trim() || ''

    return {
      url,
      title: metadata.title,
      description: metadata.description,
      content: textContent.slice(0, 10000), // テキストは10000文字まで
      markdown: markdown.slice(0, 20000), // Markdownは20000文字まで
      favicon: metadata.favicon,
      ogImage: metadata.ogImage,
      siteName: metadata.siteName,
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.error(`Timeout scraping ${url}`)
    } else {
      console.error(`Error scraping ${url}:`, error)
    }
    return null
  }
}

// 複数URLを並列スクレイピング
export async function scrapeUrls(urls: string[], options: {
  timeout?: number
  maxConcurrent?: number
} = {}): Promise<ScrapeResult[]> {
  const {
    timeout = 10000,
    maxConcurrent = 5,
  } = options

  const results: ScrapeResult[] = []

  // 並列実行数を制限しながらスクレイピング
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map(url => scrapeUrl(url, { timeout }))
    )

    for (const result of batchResults) {
      if (result) {
        results.push(result)
      }
    }
  }

  return results
}
