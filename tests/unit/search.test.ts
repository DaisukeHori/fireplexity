import { describe, it, expect, vi, beforeEach } from 'vitest'
import { search, WebSearchResult, NewsSearchResult, ImageSearchResult } from '@/lib/scraper/search'

describe('Search Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: search関数が存在する
  it('should export search function', () => {
    expect(typeof search).toBe('function')
  })

  // Test 2: 空のクエリでも結果を返す
  it('should return empty results for empty query', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('')
    expect(result).toHaveProperty('web')
    expect(result).toHaveProperty('news')
    expect(result).toHaveProperty('images')
  })

  // Test 3: Web検索結果の型が正しい
  it('should return correctly typed web results', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="result web-result">
            <a class="result__a" href="https://example.com">Example</a>
            <span class="result__snippet">Description</span>
          </div>
        </body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test query')
    if (result.web && result.web.length > 0) {
      const webResult = result.web[0]
      expect(webResult).toHaveProperty('url')
      expect(webResult).toHaveProperty('title')
    }
  })

  // Test 4: numResultsオプションが機能する
  it('should respect numResults option', async () => {
    const mockHtml = `
      <html>
        <body>
          ${Array(10).fill(0).map((_, i) => `
            <div class="result web-result">
              <a class="result__a" href="https://example${i}.com">Example ${i}</a>
              <span class="result__snippet">Description ${i}</span>
            </div>
          `).join('')}
        </body>
      </html>
    `
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test', { numResults: 3 })
    expect(result.web?.length).toBeLessThanOrEqual(3)
  })

  // Test 5: includeNewsがfalseの場合、ニュースを検索しない
  it('should not include news when includeNews is false', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test', { includeNews: false })
    expect(result.news).toEqual([])
  })

  // Test 6: includeImagesがfalseの場合、画像を検索しない
  it('should not include images when includeImages is false', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test', { includeImages: false })
    expect(result.images).toEqual([])
  })

  // Test 7: HTTPエラー時に空の結果を返す
  it('should return empty results on HTTP error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test')
    expect(result.web).toEqual([])
  })

  // Test 8: ネットワークエラー時に空の結果を返す
  it('should return empty results on network error', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    const result = await search('test')
    expect(result.web).toEqual([])
    expect(result.news).toEqual([])
    expect(result.images).toEqual([])
  })

  // Test 9: 日本語クエリを処理できる
  it('should handle Japanese query', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('日本語テスト')
    expect(result).toBeDefined()
  })

  // Test 10: 特殊文字を含むクエリを処理できる
  it('should handle query with special characters', async () => {
    const mockResponse = {
      ok: true,
      text: () => Promise.resolve('<html><body></body></html>'),
    }
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

    const result = await search('test & query <script>')
    expect(result).toBeDefined()
  })
})
