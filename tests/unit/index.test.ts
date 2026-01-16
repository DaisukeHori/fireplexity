import { describe, it, expect, vi, beforeEach } from 'vitest'
import { integratedSearch, IntegratedSearchResult } from '@/lib/scraper'

// search と scrapeUrls をモック
vi.mock('@/lib/scraper/search', () => ({
  search: vi.fn(),
}))

vi.mock('@/lib/scraper/scrape', () => ({
  scrapeUrls: vi.fn(),
}))

import { search } from '@/lib/scraper/search'
import { scrapeUrls } from '@/lib/scraper/scrape'

describe('Integrated Search Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: integratedSearch関数が存在する
  it('should export integratedSearch function', () => {
    expect(typeof integratedSearch).toBe('function')
  })

  // Test 2: 基本的な検索が動作する
  it('should perform basic search', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://example.com', title: 'Example', description: 'Desc' }],
      news: [],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([
      { url: 'https://example.com', title: 'Example', content: 'Content', markdown: '# Content' },
    ])

    const result = await integratedSearch('test query')
    expect(result.web).toHaveLength(1)
    expect(result.web[0].url).toBe('https://example.com')
  })

  // Test 3: ニュース結果を含む
  it('should include news results', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [],
      news: [{ url: 'https://news.com', title: 'News', source: 'NewsSource' }],
      images: [],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test', { includeNews: true })
    expect(result.news).toHaveLength(1)
    expect(result.news[0].source).toBe('NewsSource')
  })

  // Test 4: 画像結果を含む
  it('should include image results', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [],
      news: [],
      images: [{ url: 'https://img.com', title: 'Image', imageUrl: 'https://img.com/img.jpg' }],
    })
    vi.mocked(scrapeUrls).mockResolvedValue([])

    const result = await integratedSearch('test', { includeImages: true })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].imageUrl).toBe('https://img.com/img.jpg')
  })

  // Test 5: scrapeContentがfalseの場合スクレイピングしない
  it('should not scrape when scrapeContent is false', async () => {
    vi.mocked(search).mockResolvedValue({
      web: [{ url: 'https://example.com', title: 'Example' }],
      news: [],
      images: [],
    })

    await integratedSearch('test', { scrapeContent: false })
    expect(scrapeUrls).not.toHaveBeenCalled()
  })
})
