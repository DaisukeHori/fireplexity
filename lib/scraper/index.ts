/**
 * 内蔵検索・スクレイピングモジュール
 * Firecrawlの機能を内包した実装
 * 外部APIキー不要で動作
 */

export { search, type SearchResponse, type WebSearchResult, type NewsSearchResult, type ImageSearchResult } from './search'
export { scrapeUrl, scrapeUrls, type ScrapeResult } from './scrape'

import { search, SearchResponse } from './search'
import { scrapeUrl, scrapeUrls, ScrapeResult } from './scrape'

// 並列でスクレイプを実行
// scrapeUrlsを使用して1つのブラウザインスタンスで複数ページを処理
// （ETXTBSYエラーを回避しつつPuppeteerでJS対応）
async function scrapeUrlsParallel(urls: string[], timeout: number = 30000): Promise<ScrapeResult[]> {
  console.log(`[Scrape Parallel] Starting ${urls.length} scrapes with shared browser (timeout: ${timeout}ms, concurrent: 6)`)

  // scrapeUrlsは内部で1つのブラウザを起動し、
  // 複数ページを並列（maxConcurrent=6）で処理する
  const results = await scrapeUrls(urls, {
    timeout,
    maxConcurrent: 6,
    usePuppeteer: true,
  })

  return results
}

// Firecrawlのsearchエンドポイントと互換性のある統合検索関数
export interface IntegratedSearchResult {
  web: Array<{
    url: string
    title: string
    description?: string
    markdown?: string
    content?: string
    favicon?: string
    image?: string
    siteName?: string
  }>
  news: Array<{
    url: string
    title: string
    description?: string
    date?: string
    source?: string
    imageUrl?: string
  }>
  images: Array<{
    url: string
    title: string
    imageUrl: string
    source?: string
    width?: number
    height?: number
  }>
}

/**
 * 検索とスクレイピングを統合して実行
 * Firecrawl v2 search APIと同様の機能を提供
 */
export async function integratedSearch(
  query: string,
  options: {
    numResults?: number
    includeNews?: boolean
    includeImages?: boolean
    scrapeContent?: boolean
    braveApiKey?: string
    useParallelScrape?: boolean // 並列スクレイプを使用するか
  } = {}
): Promise<IntegratedSearchResult> {
  const {
    numResults = 6,
    includeNews = true,
    includeImages = true,
    scrapeContent = true,
    braveApiKey,
    useParallelScrape = true, // デフォルトで並列を使用
  } = options

  // まず検索を実行
  const searchResults = await search(query, {
    numResults,
    includeNews,
    includeImages,
    braveApiKey,
  })

  // Web検索結果のURLをスクレイピング
  let webResultsWithContent: IntegratedSearchResult['web'] = []

  if (searchResults.web && searchResults.web.length > 0) {
    if (scrapeContent) {
      // スクレイピングしてコンテンツを取得
      const urls = searchResults.web.map(r => r.url)

      // 並列スクレイプ（1つのブラウザで複数ページを処理）または通常スクレイプ
      // Vercel Pro: タイムアウト30秒、同時2ページ
      const scrapedResults = useParallelScrape
        ? await scrapeUrlsParallel(urls, 30000)
        : await scrapeUrls(urls, { timeout: 8000 })

      // スクレイプ結果のログ
      console.log('[Scrape] Results summary:')
      for (const url of urls) {
        const scraped = scrapedResults.find(s => s.url === url)
        const charCount = scraped?.markdown?.length || scraped?.content?.length || 0
        console.log(`  - ${new URL(url).hostname}: ${charCount} chars${charCount === 0 ? ' (failed - using description fallback)' : ''}`)
      }

      // 検索結果とスクレイピング結果をマージ
      webResultsWithContent = searchResults.web.map(searchResult => {
        const scraped = scrapedResults.find(s => s.url === searchResult.url)
        let siteName = scraped?.siteName
        if (!siteName) {
          try {
            siteName = new URL(searchResult.url).hostname.replace('www.', '')
          } catch {
            siteName = 'unknown'
          }
        }

        // スクレイプ失敗時は検索結果のdescriptionをフォールバックとして使用
        const hasScrapedContent = (scraped?.markdown && scraped.markdown.length > 50) ||
                                   (scraped?.content && scraped.content.length > 50)

        let markdown = scraped?.markdown
        let content = scraped?.content

        // スクレイプ失敗時のフォールバック
        if (!hasScrapedContent && searchResult.description) {
          // 検索結果のdescriptionをコンテンツとして使用
          markdown = `# ${searchResult.title}\n\n${searchResult.description}`
          content = searchResult.description
          console.log(`[Scrape] Fallback used for ${siteName}: description (${searchResult.description?.length || 0} chars)`)
        }

        return {
          url: searchResult.url,
          title: scraped?.title || searchResult.title,
          description: scraped?.description || searchResult.description,
          markdown,
          content,
          favicon: scraped?.favicon,
          image: scraped?.ogImage,
          siteName,
        }
      })
    } else {
      // スクレイピングなしで検索結果のみ返す
      webResultsWithContent = searchResults.web.map(r => {
        let siteName = 'unknown'
        try {
          siteName = new URL(r.url).hostname.replace('www.', '')
        } catch {
          // URLパースエラーは無視
        }
        return {
          url: r.url,
          title: r.title,
          description: r.description,
          // descriptionをフォールバックとして使用
          markdown: r.description ? `# ${r.title}\n\n${r.description}` : undefined,
          content: r.description,
          siteName,
        }
      })
    }
  }

  // ニュース結果を変換
  const newsResults = (searchResults.news || []).map(r => ({
    url: r.url,
    title: r.title,
    description: r.description,
    date: r.date,
    source: r.source,
    imageUrl: r.imageUrl,
  }))

  // 画像結果を変換
  const imageResults = (searchResults.images || []).map(r => ({
    url: r.url,
    title: r.title,
    imageUrl: r.imageUrl,
    source: r.source,
    width: r.width,
    height: r.height,
  }))

  return {
    web: webResultsWithContent,
    news: newsResults,
    images: imageResults,
  }
}
