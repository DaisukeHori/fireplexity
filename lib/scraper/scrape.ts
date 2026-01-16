/**
 * 内蔵ウェブスクレイパー
 * Firecrawlのスクレイピング機能を内包した実装
 * Vercel Serverless互換（Puppeteer + cheerio使用）
 */

import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import puppeteerCore, { type HTTPRequest } from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

// Vercel環境かどうかを判定
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined

// Puppeteerブラウザインスタンスを取得
async function getBrowser() {
  // デフォルトのビューポート設定
  const defaultViewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920,
  }

  if (isVercel) {
    // Vercel Serverless環境
    const executablePath = await chromium.executablePath()
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport,
      executablePath,
      headless: true,
    })
  } else {
    // ローカル環境: システムにインストールされたChromeを使用
    const possiblePaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ]

    let executablePath: string | undefined
    for (const path of possiblePaths) {
      try {
        const fs = await import('fs')
        if (fs.existsSync(path)) {
          executablePath = path
          break
        }
      } catch {
        // 無視
      }
    }

    if (!executablePath) {
      // Chromeが見つからない場合はnullを返す（フォールバック処理へ）
      return null
    }

    return puppeteerCore.launch({
      executablePath,
      headless: true,
      defaultViewport,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
}

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

// Puppeteerを使ってJavaScriptレンダリング後のHTMLを取得
async function scrapeWithPuppeteer(url: string, timeout: number): Promise<string | null> {
  let browser = null
  try {
    browser = await getBrowser()
    if (!browser) {
      console.log(`[Scrape] Puppeteer not available, falling back to fetch`)
      return null
    }

    const page = await browser.newPage()

    // 不要なリソースをブロック
    await page.setRequestInterception(true)
    page.on('request', (req: HTTPRequest) => {
      const resourceType = req.resourceType()
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort()
      } else {
        req.continue()
      }
    })

    // User-Agentを設定
    await page.setUserAgent(getRandomUserAgent())

    // ページにアクセス
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    })

    // 少し待ってJSの実行を確実に完了させる
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)))

    // HTMLを取得
    const html = await page.content()

    await page.close()

    return html
  } catch (error) {
    console.warn(`[Scrape Puppeteer] Error: ${url}`, (error as Error).message || error)
    return null
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        // 無視
      }
    }
  }
}

// fetch + cheerioでスクレイピング（フォールバック用）
async function scrapeWithFetch(url: string, timeout: number, maxContentLength: number): Promise<string | null> {
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
      console.warn(`[Scrape Fetch] ${response.status}: ${url}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return null
    }

    let html = await response.text()
    if (html.length > maxContentLength) {
      html = html.slice(0, maxContentLength)
    }

    return html
  } catch (error) {
    console.warn(`[Scrape Fetch] Error: ${url}`, (error as Error).message || error)
    return null
  }
}

// HTMLを処理してScrapeResultを生成
function processHtml(html: string, url: string): ScrapeResult {
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
    content: textContent.slice(0, 10000),
    markdown: markdown.slice(0, 20000),
    favicon: metadata.favicon,
    ogImage: metadata.ogImage,
    siteName: metadata.siteName,
  }
}

// URLをスクレイピング（Puppeteer優先、フォールバックあり）
export async function scrapeUrl(url: string, options: {
  timeout?: number
  maxContentLength?: number
  usePuppeteer?: boolean
} = {}): Promise<ScrapeResult | null> {
  const {
    timeout = 15000,
    maxContentLength = 50000,
    usePuppeteer = true,
  } = options

  try {
    let html: string | null = null

    // Puppeteerを試行
    if (usePuppeteer) {
      console.log(`[Scrape] Trying Puppeteer for: ${new URL(url).hostname}`)
      html = await scrapeWithPuppeteer(url, timeout)
    }

    // Puppeteerが失敗またはスキップの場合、fetchにフォールバック
    if (!html) {
      console.log(`[Scrape] Using fetch fallback for: ${new URL(url).hostname}`)
      html = await scrapeWithFetch(url, timeout, maxContentLength)
    }

    if (!html) {
      return null
    }

    return processHtml(html, url)
  } catch (error) {
    console.warn(`[Scrape] Error: ${url}`, (error as Error).message || error)
    return null
  }
}

// 複数URLを並列スクレイピング（ブラウザを再利用して効率化）
export async function scrapeUrls(urls: string[], options: {
  timeout?: number
  maxConcurrent?: number
  usePuppeteer?: boolean
} = {}): Promise<ScrapeResult[]> {
  const {
    timeout = 15000,
    maxConcurrent = 3,
    usePuppeteer = true,
  } = options

  const results: ScrapeResult[] = []

  // Puppeteerを使う場合はブラウザを一度だけ起動して再利用
  if (usePuppeteer) {
    let browser = null
    try {
      browser = await getBrowser()

      if (browser) {
        console.log(`[Scrape] Using Puppeteer for ${urls.length} URLs`)

        for (let i = 0; i < urls.length; i += maxConcurrent) {
          const batch = urls.slice(i, i + maxConcurrent)
          const batchResults = await Promise.all(
            batch.map(async (url) => {
              let page = null
              try {
                page = await browser!.newPage()

                // 不要なリソースをブロック
                await page.setRequestInterception(true)
                page.on('request', (req: HTTPRequest) => {
                  const resourceType = req.resourceType()
                  if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort()
                  } else {
                    req.continue()
                  }
                })

                await page.setUserAgent(getRandomUserAgent())
                await page.goto(url, { waitUntil: 'networkidle2', timeout })
                await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)))

                const html = await page.content()
                await page.close()

                if (html) {
                  return processHtml(html, url)
                }
                return null
              } catch (error) {
                console.warn(`[Scrape Puppeteer] Error: ${url}`, (error as Error).message || error)
                if (page) {
                  try { await page.close() } catch { /* ignore */ }
                }
                // フォールバックをfetchで試行
                const fallbackHtml = await scrapeWithFetch(url, timeout, 50000)
                if (fallbackHtml) {
                  return processHtml(fallbackHtml, url)
                }
                return null
              }
            })
          )

          for (const result of batchResults) {
            if (result) {
              results.push(result)
            }
          }
        }

        return results
      }
    } catch (browserError) {
      console.warn(`[Scrape] Browser launch failed, falling back to fetch:`, (browserError as Error).message)
    } finally {
      if (browser) {
        try { await browser.close() } catch { /* ignore */ }
      }
    }
  }

  // Puppeteerが使えない場合はfetchでスクレイピング
  console.log(`[Scrape] Using fetch for ${urls.length} URLs`)
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const html = await scrapeWithFetch(url, timeout, 50000)
        if (html) {
          return processHtml(html, url)
        }
        return null
      })
    )

    for (const result of batchResults) {
      if (result) {
        results.push(result)
      }
    }
  }

  return results
}
