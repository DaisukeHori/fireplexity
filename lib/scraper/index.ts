/**
 * 内蔵検索・スクレイピングモジュール
 * Firecrawlの機能を内包した実装
 * 外部APIキー不要で動作
 */

export { search, type SearchResponse, type WebSearchResult, type NewsSearchResult, type ImageSearchResult } from './search'
export { scrapeUrl, scrapeUrls, type ScrapeResult } from './scrape'

import { search, SearchResponse } from './search'
import { scrapeUrls, ScrapeResult } from './scrape'

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
  } = {}
): Promise<IntegratedSearchResult> {
  const {
    numResults = 6,
    includeNews = true,
    includeImages = true,
    scrapeContent = true,
  } = options

  // まず検索を実行
  const searchResults = await search(query, {
    numResults,
    includeNews,
    includeImages,
    lang: 'ja',
    country: 'jp',
  })

  // Web検索結果のURLをスクレイピング
  let webResultsWithContent: IntegratedSearchResult['web'] = []

  if (searchResults.web && searchResults.web.length > 0) {
    if (scrapeContent) {
      // スクレイピングしてコンテンツを取得
      const urls = searchResults.web.map(r => r.url)
      const scrapedResults = await scrapeUrls(urls, { timeout: 8000 })

      // 検索結果とスクレイピング結果をマージ
      webResultsWithContent = searchResults.web.map(searchResult => {
        const scraped = scrapedResults.find(s => s.url === searchResult.url)
        return {
          url: searchResult.url,
          title: scraped?.title || searchResult.title,
          description: scraped?.description || searchResult.description,
          markdown: scraped?.markdown,
          content: scraped?.content,
          favicon: scraped?.favicon,
          image: scraped?.ogImage,
          siteName: scraped?.siteName || new URL(searchResult.url).hostname.replace('www.', ''),
        }
      })
    } else {
      // スクレイピングなしで検索結果のみ返す
      webResultsWithContent = searchResults.web.map(r => ({
        url: r.url,
        title: r.title,
        description: r.description,
        siteName: new URL(r.url).hostname.replace('www.', ''),
      }))
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
