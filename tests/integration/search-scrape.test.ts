import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// モジュール全体をモック
vi.mock('@/lib/scraper/search', async () => {
  return {
    search: vi.fn(),
    WebSearchResult: {},
    NewsSearchResult: {},
    ImageSearchResult: {},
    SearchResponse: {},
  }
})

vi.mock('@/lib/scraper/scrape', async () => {
  return {
    scrapeUrl: vi.fn(),
    scrapeUrls: vi.fn(),
    ScrapeResult: {},
  }
})

import { integratedSearch } from '@/lib/scraper'
import { search } from '@/lib/scraper/search'
import { scrapeUrls, scrapeUrl } from '@/lib/scraper/scrape'

describe('Search + Scrape Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: 検索とスクレイピングが統合して動作
  it('should integrate search and scraping', async () => {
    // 50文字以上のコンテンツが必要（hasScrapedContent判定のため）
    const longContent = 'This is a long content that exceeds fifty characters for proper scraping detection.'
    vi.mocked(search).mockResolvedValue({
      web: [
        { url: 'https://example.com', title: 'Example', description: 'Description' }
      ],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      {
        url: 'https://example.com',
        title: 'Example Page',
        content: longContent,
        markdown: '# Example\n\n' + longContent,
        favicon: 'https://example.com/favicon.ico',
      }
    ])

    const result = await integratedSearch('test query')

    expect(search).toHaveBeenCalledWith('test query', expect.any(Object))
    expect(scrapeUrls).toHaveBeenCalled()
    expect(result.web[0].markdown).toContain('# Example')
  })

  // Test 2: スクレイピング結果が検索結果にマージされる
  it('should merge scraped content with search results', async () => {
    // 50文字以上のコンテンツが必要
    const longContent = 'Full page content here that exceeds fifty characters for proper detection by the scraper.'
    vi.mocked(search).mockResolvedValue({
      web: [
        { url: 'https://test.com', title: 'Test', description: 'Short desc' }
      ],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      {
        url: 'https://test.com',
        title: 'Test Full Title',
        description: 'Detailed description',
        content: longContent,
        markdown: '## Markdown content\n\n' + longContent,
        ogImage: 'https://test.com/og.jpg',
        siteName: 'TestSite',
      }
    ])

    const result = await integratedSearch('test')

    expect(result.web[0].title).toBe('Test Full Title')
    expect(result.web[0].content).toBe(longContent)
    expect(result.web[0].image).toBe('https://test.com/og.jpg')
  })

  // Test 3: スクレイピングが失敗しても検索結果は返される
  it('should return search results even when scraping fails', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [
        { url: 'https://fail.com', title: 'Fail', description: 'Will fail' }
      ],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test')

    expect(result.web).toHaveLength(1)
    expect(result.web[0].url).toBe('https://fail.com')
    expect(result.web[0].title).toBe('Fail')
  })

  // Test 4: ニュースと画像も統合結果に含まれる
  it('should include news and images in integrated results', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [],
      news: [
        { url: 'https://news.com/article', title: 'News Article', source: 'News Site', date: '2024-01-01' }
      ],
      images: [
        { url: 'https://images.com/pic', title: 'Image', imageUrl: 'https://images.com/pic.jpg', width: 800, height: 600 }
      ],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test')

    expect(result.news).toHaveLength(1)
    expect(result.news[0].source).toBe('News Site')
    expect(result.images).toHaveLength(1)
    expect(result.images[0].width).toBe(800)
  })

  // Test 5: numResultsオプションが検索に渡される
  it('should pass numResults option to search', async () => {
    vi.mocked(search).mockResolvedValue({ web: [], news: [], images: [] })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    await integratedSearch('test', { numResults: 10 })

    expect(search).toHaveBeenCalledWith('test', expect.objectContaining({ numResults: 10 }))
  })

  // Test 6: includeNewsオプションが機能する
  it('should respect includeNews option', async () => {
    vi.mocked(search).mockResolvedValue({ web: [], news: [], images: [] })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    await integratedSearch('test', { includeNews: false })

    expect(search).toHaveBeenCalledWith('test', expect.objectContaining({ includeNews: false }))
  })

  // Test 7: includeImagesオプションが機能する
  it('should respect includeImages option', async () => {
    vi.mocked(search).mockResolvedValue({ web: [], news: [], images: [] })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    await integratedSearch('test', { includeImages: false })

    expect(search).toHaveBeenCalledWith('test', expect.objectContaining({ includeImages: false }))
  })

  // Test 8: scrapeContentがfalseの場合スクレイピングをスキップ
  it('should skip scraping when scrapeContent is false', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://skip.com', title: 'Skip' }],
      news: [],
      images: [],
    })

    await integratedSearch('test', { scrapeContent: false })

    expect(scrapeUrls).not.toHaveBeenCalled()
  })

  // Test 9: 複数のWeb結果が全てスクレイピングされる
  it('should scrape all web results', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [
        { url: 'https://site1.com', title: 'Site 1' },
        { url: 'https://site2.com', title: 'Site 2' },
        { url: 'https://site3.com', title: 'Site 3' },
      ],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      { url: 'https://site1.com', title: 'Site 1', content: 'Content 1 that is long enough to pass 50 chars check' },
      { url: 'https://site2.com', title: 'Site 2', content: 'Content 2 that is long enough to pass 50 chars check' },
      { url: 'https://site3.com', title: 'Site 3', content: 'Content 3 that is long enough to pass 50 chars check' },
    ])

    const result = await integratedSearch('test')

    expect(scrapeUrls).toHaveBeenCalledWith(
      ['https://site1.com', 'https://site2.com', 'https://site3.com'],
      expect.any(Object)
    )
    expect(result.web).toHaveLength(3)
  })

  // Test 10: 部分的なスクレイピング成功でも動作
  it('should handle partial scraping success', async () => {
    // 50文字以上のコンテンツが必要
    const longContent = 'Full content that exceeds fifty characters for proper scraping detection by the integration.'
    vi.mocked(search).mockResolvedValue({
      web: [
        { url: 'https://success.com', title: 'Success' },
        { url: 'https://fail.com', title: 'Fail', description: 'Fallback description' },
      ],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      { url: 'https://success.com', title: 'Success Full', content: longContent, markdown: longContent },
    ])

    const result = await integratedSearch('test')

    expect(result.web).toHaveLength(2)
    expect(result.web[0].content).toBe(longContent)
    // スクレイプ失敗時はdescriptionがフォールバックとして使われる
    expect(result.web[1].content).toBe('Fallback description')
  })

  // Test 11: 日本語クエリの統合処理
  it('should handle Japanese query in integration', async () => {
    // 50文字以上のコンテンツが必要
    const longJapaneseContent = 'これは日本語のコンテンツです。スクレイピング判定に必要な50文字以上のテキストを含んでいます。詳細な情報がここに記載されています。'
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://jp.com', title: '日本語サイト', description: '説明' }],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      { url: 'https://jp.com', title: '日本語サイト', content: longJapaneseContent, markdown: longJapaneseContent }
    ])

    const result = await integratedSearch('日本語検索')

    expect(result.web[0].title).toBe('日本語サイト')
    expect(result.web[0].content).toBe(longJapaneseContent)
  })

  // Test 12: siteName がURL から抽出される
  it('should extract siteName from URL when not provided', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://www.example.com/page', title: 'Page' }],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test', { scrapeContent: false })

    expect(result.web[0].siteName).toBe('example.com')
  })

  // Test 13: favicon が保持される
  it('should preserve favicon from scraped results', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://site.com', title: 'Site' }],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      { url: 'https://site.com', title: 'Site', favicon: 'https://site.com/icon.ico', content: 'Some content that is long enough' }
    ])

    const result = await integratedSearch('test')

    expect(result.web[0].favicon).toBe('https://site.com/icon.ico')
  })

  // Test 14: ニュースのimageUrlがimageフィールドにマッピングされる
  it('should map news imageUrl to image field', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [],
      news: [{ url: 'https://news.com', title: 'News', imageUrl: 'https://news.com/thumb.jpg' }],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test')

    expect(result.news[0].imageUrl).toBe('https://news.com/thumb.jpg')
  })

  // Test 15: 画像結果のサイズ情報が保持される
  it('should preserve image size information', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [],
      news: [],
      images: [{ url: 'https://img.com', title: 'Img', imageUrl: 'https://img.com/pic.jpg', width: 1920, height: 1080 }],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test')

    expect(result.images[0].width).toBe(1920)
    expect(result.images[0].height).toBe(1080)
  })
})
