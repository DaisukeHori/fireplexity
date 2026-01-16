import { describe, it, expect } from 'vitest'
import { ErrorMessages, getErrorMessage } from '@/lib/error-messages'

describe('Error Messages Module', () => {
  // Test 1: ErrorMessagesがエクスポートされている
  it('should export ErrorMessages object', () => {
    expect(ErrorMessages).toBeDefined()
    expect(typeof ErrorMessages).toBe('object')
  })

  // Test 2: getErrorMessage関数が存在する
  it('should export getErrorMessage function', () => {
    expect(typeof getErrorMessage).toBe('function')
  })

  // Test 3: 401エラーのメッセージを返す
  it('should return 401 error message', () => {
    const result = getErrorMessage(401)
    expect(result.title).toBe('認証が必要です')
    expect(result.message).toContain('APIキー')
  })

  // Test 4: 429エラーのメッセージを返す
  it('should return 429 rate limit message', () => {
    const result = getErrorMessage(429)
    expect(result.title).toBe('レート制限')
    expect(result.message).toContain('リクエスト')
  })

  // Test 5: 不明なエラーコードで500を返す
  it('should return 500 for unknown error codes', () => {
    const result = getErrorMessage(999)
    expect(result.title).toBe('エラーが発生しました')
  })

  // Test 6: 全てのエラーにtitleがある
  it('should have title for all errors', () => {
    const codes = [401, 402, 429, 500, 504]
    for (const code of codes) {
      const result = getErrorMessage(code)
      expect(result.title).toBeDefined()
      expect(result.title.length).toBeGreaterThan(0)
    }
  })

  // Test 7: 全てのエラーにmessageがある
  it('should have message for all errors', () => {
    const codes = [401, 402, 429, 500, 504]
    for (const code of codes) {
      const result = getErrorMessage(code)
      expect(result.message).toBeDefined()
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  // Test 8: 全てのエラーにactionがある
  it('should have action for all errors', () => {
    const codes = [401, 402, 429, 500, 504]
    for (const code of codes) {
      const result = getErrorMessage(code)
      expect(result.action).toBeDefined()
    }
  })

  // Test 9: 全てのエラーにactionUrlがある
  it('should have actionUrl for all errors', () => {
    const codes = [401, 402, 429, 500, 504]
    for (const code of codes) {
      const result = getErrorMessage(code)
      expect(result.actionUrl).toBeDefined()
      expect(result.actionUrl.startsWith('https://')).toBe(true)
    }
  })

  // Test 10: 504タイムアウトエラーの内容
  it('should return timeout message for 504', () => {
    const result = getErrorMessage(504)
    expect(result.title).toBe('タイムアウト')
    expect(result.message).toContain('時間')
  })
})
