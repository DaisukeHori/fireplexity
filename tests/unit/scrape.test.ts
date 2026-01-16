import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeUrl, scrapeUrls, ScrapeResult } from '@/lib/scraper/scrape'

describe('Scrape Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: scrapeUrl関数が存在する
  it('should export scrapeUrl function', () => {
    expect(typeof scrapeUrl).toBe('function')
  })

  // Test 2: scrapeUrls関数が存在する
  it('should export scrapeUrls function', () => {
    expect(typeof scrapeUrls).toBe('function')
  })

  // Test 3: 有効なHTMLからタイトルを抽出
  it('should extract title from valid HTML', async () => {
    const mockHtml = `
      <html>
        <head><title>テストページ</title></head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.title).toBe('テストページ')
  })

  // Test 4: OGタイトルを優先して抽出
  it('should prefer og:title over regular title', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>通常タイトル</title>
          <meta property="og:title" content="OGタイトル">
        </head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.title).toBe('OGタイトル')
  })

  // Test 5: descriptionメタタグを抽出
  it('should extract description from meta tag', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>テスト</title>
          <meta name="description" content="これは説明です">
        </head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.description).toBe('これは説明です')
  })

  // Test 6: HTTPエラー時にnullを返す
  it('should return null on HTTP error', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result).toBeNull()
  })

  // Test 7: ネットワークエラー時にnullを返す
  it('should return null on network error', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    const result = await scrapeUrl('https://example.com')
    expect(result).toBeNull()
  })

  // Test 8: 非HTMLコンテンツでnullを返す
  it('should return null for non-HTML content', async () => {
    const mockResponse = {
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com/api')
    expect(result).toBeNull()
  })

  // Test 9: mainタグからコンテンツを抽出
  it('should extract content from main tag', async () => {
    const mockHtml = `
      <html>
        <head><title>テスト</title></head>
        <body>
          <nav>ナビゲーション</nav>
          <main>メインコンテンツです。これは重要な内容を含んでいます。長いテキストです。</main>
          <footer>フッター</footer>
        </body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.content).toContain('メインコンテンツ')
  })

  // Test 10: articleタグからコンテンツを抽出
  it('should extract content from article tag', async () => {
    const mockHtml = `
      <html>
        <head><title>テスト</title></head>
        <body>
          <header>ヘッダー</header>
          <article>記事の内容です。これは本文テキストを含んでいます。詳細な説明があります。</article>
          <aside>サイドバー</aside>
        </body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.content).toContain('記事の内容')
  })

  // Test 11: scrapeUrlsが複数のURLを処理
  it('should process multiple URLs with scrapeUrls', async () => {
    const mockHtml = `
      <html>
        <head><title>テスト</title></head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const results = await scrapeUrls(['https://example1.com', 'https://example2.com'])
    expect(results.length).toBe(2)
  })

  // Test 12: 空のURL配列で空の結果を返す
  it('should return empty array for empty URL list', async () => {
    const results = await scrapeUrls([])
    expect(results).toEqual([])
  })

  // Test 13: faviconを抽出
  it('should extract favicon', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>テスト</title>
          <link rel="icon" href="/favicon.ico">
        </head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.favicon).toContain('favicon')
  })

  // Test 14: og:imageを抽出
  it('should extract og:image', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>テスト</title>
          <meta property="og:image" content="https://example.com/image.jpg">
        </head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.ogImage).toBe('https://example.com/image.jpg')
  })

  // Test 15: サイト名を抽出
  it('should extract site name from og:site_name', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>テスト</title>
          <meta property="og:site_name" content="テストサイト">
        </head>
        <body><main>コンテンツ</main></body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
      headers: new Map([['content-type', 'text/html']]),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response)

    const result = await scrapeUrl('https://example.com')
    expect(result?.siteName).toBe('テストサイト')
  })
})
