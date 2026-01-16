/**
 * 内蔵ウェブスクレイパー
 * Firecrawlのスクレイピング機能を内包した実装
 * Vercel Serverless互換（cheerio使用）
 */

import * as cheerio from 'cheerio'
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
function cleanHtml($: cheerio.CheerioAPI): void {
  // 不要な要素を削除
  for (const selector of SELECTORS_TO_REMOVE) {
    try {
      $(selector).remove()
    } catch {
      // セレクタが無効な場合は無視
    }
  }
}

// メインコンテンツを抽出
function extractMainContent($: cheerio.CheerioAPI): string {
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
    const element = $(selector)
    if (element.length > 0) {
      const text = element.text().trim()
      if (text.length > 100) {
        return element.html() || ''
      }
    }
  }

  // 見つからない場合はbodyを使用
  return $('body').html() || ''
}

// メタデータを抽出
function extractMetadata($: cheerio.CheerioAPI, url: string): {
  title: string
  description?: string
  favicon?: string
  ogImage?: string
  siteName?: string
} {
  const getMetaContent = (name: string): string | undefined => {
    const content = $(`meta[name="${name}"]`).attr('content') ||
                   $(`meta[property="${name}"]`).attr('content')
    return content || undefined
  }

  // タイトル取得
  const title =
    getMetaContent('og:title') ||
    getMetaContent('twitter:title') ||
    $('title').text().trim() ||
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
  let siteName = getMetaContent('og:site_name')
  if (!siteName) {
    try {
      siteName = new URL(url).hostname.replace('www.', '')
    } catch {
      siteName = undefined
    }
  }

  // Favicon取得
  let favicon: string | undefined
  const faviconHref = $('link[rel="icon"]').attr('href') ||
                      $('link[rel="shortcut icon"]').attr('href')
  if (faviconHref) {
    try {
      favicon = new URL(faviconHref, url).href
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
      console.warn(`[Scrape] ${response.status}: ${url}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      // HTML以外は静かにスキップ
      return null
    }

    let html = await response.text()

    // 最大長を超える場合は切り詰め
    if (html.length > maxContentLength) {
      html = html.slice(0, maxContentLength)
    }

    const $ = cheerio.load(html, { baseURI: url })

    // メタデータを抽出
    const metadata = extractMetadata($, url)

    // HTMLをクリーンアップ
    cleanHtml($)

    // メインコンテンツを抽出
    const mainContent = extractMainContent($)

    // Markdownに変換
    const markdown = htmlToMarkdown(mainContent)

    // テキストコンテンツを抽出
    const $temp = cheerio.load(mainContent)
    const textContent = $temp.text().trim()

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
    console.warn(`[Scrape] Error: ${url}`, (error as Error).message || error)
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
