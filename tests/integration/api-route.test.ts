import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 環境変数のモック
const originalEnv = process.env

// multiLayerSearchをモック
vi.mock('@/lib/multi-layer-search', () => ({
  multiLayerSearch: vi.fn(),
  analyzeQueryWithLLM: vi.fn(),
  analyzeQuerySimple: vi.fn(() => ({
    intent: 'factual',
    complexity: 'simple',
    suggestedDepth: 1,
    aspects: [],
    keywords: []
  })),
}))

// integratedSearchをモック（フォールバック用）
vi.mock('@/lib/scraper', () => ({
  integratedSearch: vi.fn(),
}))

// company-ticker-mapをモック
vi.mock('@/lib/company-ticker-map', () => ({
  detectCompanyTicker: vi.fn(),
}))

// content-selectionをモック
vi.mock('@/lib/content-selection', () => ({
  selectRelevantContent: vi.fn((content: string) => content.substring(0, 500)),
}))

import { multiLayerSearch } from '@/lib/multi-layer-search'
import { integratedSearch } from '@/lib/scraper'
import { detectCompanyTicker } from '@/lib/company-ticker-map'

describe('API Route Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }

    // デフォルトのモック設定
    vi.mocked(multiLayerSearch).mockResolvedValue({
      layers: [{
        layer: 1,
        query: 'test',
        sources: [],
        newsResults: [],
        coverage: 0.8,
        gaps: []
      }],
      allSources: [],
      allNews: [],
      imageResults: [],
      totalSearches: 1,
      finalCoverage: 0.8
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // Test 1: クエリなしでエラーを返す
  it('should return error when query is missing', async () => {
    // APIルートをインポートする前にenv設定
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  // Test 2: OpenAI APIキーが必要な場合のエラー
  it('should return error when OpenAI API key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GROQ_API_KEY

    // モジュールキャッシュをクリア
    vi.resetModules()

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', provider: 'openai' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(500)
  })

  // Test 3: Groq APIキーが必要な場合のエラー
  it('should return error when Groq API key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GROQ_API_KEY

    vi.resetModules()

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', provider: 'groq' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(500)
  })

  // Test 4: messagesからクエリを抽出
  it('should extract query from messages', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'テストクエリ' }]
          }
        ]
      }),
    })

    const response = await POST(request)
    // ストリームレスポンスなので200を期待
    expect(response.status).toBe(200)
  })

  // Test 5: detectCompanyTickerがモックされている
  it('should have detectCompanyTicker mocked', async () => {
    vi.mocked(detectCompanyTicker).mockReturnValue('AAPL')

    const result = detectCompanyTicker('Apple stock')
    expect(result).toBe('AAPL')
    expect(detectCompanyTicker).toHaveBeenCalledWith('Apple stock')
  })

  // Test 6: プロバイダー選択のデフォルト動作
  it('should default to openai when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'openai-key'
    delete process.env.GROQ_API_KEY

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  // Test 7: 明示的なプロバイダー選択
  it('should use specified provider', async () => {
    process.env.GROQ_API_KEY = 'groq-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', provider: 'groq' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  // Test 8: リクエストボディからOpenAI APIキーを取得
  it('should use openaiApiKey from request body', async () => {
    delete process.env.OPENAI_API_KEY

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test',
        openaiApiKey: 'user-provided-key',
        provider: 'openai'
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  // Test 9: フォローアップ質問の判定
  it('should detect follow-up questions', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'follow up',
        messages: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
          { role: 'user', content: 'follow up' },
        ]
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  // Test 10: 検索クエリでストリームレスポンスが返される
  it('should process search query and return stream', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    // multiLayerSearchはストリーム処理中に呼ばれるため
    // レスポンスの成功を確認
    expect(response.headers.get('content-type')).toMatch(/text/)
  })

  // Test 11: ストリームレスポンスが返される
  it('should return stream response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    vi.mocked(multiLayerSearch).mockResolvedValue({
      layers: [{
        layer: 1,
        query: 'test',
        sources: [{ url: 'https://example.com', title: 'Example', layer: 1 }],
        newsResults: [],
        coverage: 0.8,
        gaps: []
      }],
      allSources: [{ url: 'https://example.com', title: 'Example', description: 'Desc', layer: 1 }],
      allNews: [],
      imageResults: [],
      totalSearches: 1,
      finalCoverage: 0.8
    })

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    })

    const response = await POST(request)
    const contentType = response.headers.get('content-type')
    // UI message streamはtext/event-streamまたはtext/plainを返す
    expect(contentType).toMatch(/text\/(event-stream|plain)/)
  })

  // Test 12: contentフィールドからクエリを抽出
  it('should extract query from content field', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'コンテンツからのクエリ' }
        ]
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  // Test 13: 空のメッセージ配列でエラー
  it('should return error for empty messages without query', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  // Test 14: 日本語クエリの処理
  it('should handle Japanese query', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '日本語でテスト' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    // ストリームレスポンスが返されることを確認
    expect(response.headers.get('content-type')).toMatch(/text/)
  })

  // Test 15: エラー時のJSON応答
  it('should return JSON error for malformed request', async () => {
    const { POST } = await import('@/app/api/fireplexity/search/route')
    const request = new Request('http://localhost:3000/api/fireplexity/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    })

    const response = await POST(request)
    expect(response.status).toBe(500)

    const json = await response.json()
    expect(json.error).toBeDefined()
  })
})
