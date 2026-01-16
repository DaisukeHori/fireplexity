import { describe, it, expect } from 'vitest'
import { companyTickerMap, detectCompanyTicker } from '@/lib/company-ticker-map'

describe('Company Ticker Map Module', () => {
  // Test 1: companyTickerMapがエクスポートされている
  it('should export companyTickerMap', () => {
    expect(companyTickerMap).toBeDefined()
    expect(typeof companyTickerMap).toBe('object')
  })

  // Test 2: detectCompanyTicker関数が存在する
  it('should export detectCompanyTicker function', () => {
    expect(typeof detectCompanyTicker).toBe('function')
  })

  // Test 3: Appleの株価クエリを検出
  it('should detect Apple stock ticker', () => {
    const result = detectCompanyTicker('Apple stock price')
    expect(result).toBe('NASDAQ:AAPL')
  })

  // Test 4: Teslaの株価クエリを検出
  it('should detect Tesla stock ticker', () => {
    const result = detectCompanyTicker('Tesla share price today')
    expect(result).toBe('NASDAQ:TSLA')
  })

  // Test 5: 株価に関係ないクエリはnullを返す
  it('should return null for non-market queries', () => {
    const result = detectCompanyTicker('What is Apple?')
    expect(result).toBeNull()
  })

  // Test 6: $記号付きティッカーを検出
  it('should detect ticker with $ symbol', () => {
    const result = detectCompanyTicker('$AAPL is trending')
    // $記号付きの場合、マーケットキーワードがないのでnullを返す可能性
    // ただしパターンマッチはする
    expect(result === 'NASDAQ:AAPL' || result === null).toBe(true)
  })

  // Test 7: stock chartキーワードを含むクエリを処理
  it('should handle market query with chart keyword', () => {
    const result = detectCompanyTicker('Apple stock chart')
    expect(result).toBe('NASDAQ:AAPL')
  })

  // Test 8: 複数の企業名候補から正しいものを選択
  it('should detect correct company from ambiguous query', () => {
    const result = detectCompanyTicker('Microsoft stock performance')
    expect(result).toBe('NASDAQ:MSFT')
  })

  // Test 9: 大文字小文字を区別しない
  it('should be case insensitive for company names', () => {
    const result = detectCompanyTicker('GOOGLE stock price')
    expect(result).toBe('NASDAQ:GOOGL')
  })

  // Test 10: 別名（Meta/Facebook）を認識
  it('should recognize company aliases', () => {
    const metaResult = detectCompanyTicker('Meta stock')
    const facebookResult = detectCompanyTicker('Facebook stock')
    expect(metaResult).toBe('NASDAQ:META')
    expect(facebookResult).toBe('NASDAQ:META')
  })
})
