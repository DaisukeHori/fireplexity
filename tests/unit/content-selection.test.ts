import { describe, it, expect } from 'vitest'
import { selectRelevantContent } from '@/lib/content-selection'

describe('Content Selection Module', () => {
  // Test 1: selectRelevantContent関数が存在する
  it('should export selectRelevantContent function', () => {
    expect(typeof selectRelevantContent).toBe('function')
  })

  // Test 2: 短いコンテンツをそのまま返す
  it('should return short content as-is', () => {
    const content = 'これは短いテキストです。'
    const result = selectRelevantContent(content, 'テスト', 2000)
    expect(result).toContain('これは短いテキストです')
  })

  // Test 3: キーワードを含む段落を優先する
  it('should prioritize paragraphs containing keywords', () => {
    const content = `導入文です。

これは関係ない段落です。

AIについての段落です。機械学習の説明。

さらに関係ない内容です。

結論です。`

    const result = selectRelevantContent(content, 'AI 機械学習', 2000)
    expect(result).toContain('AI')
    expect(result).toContain('機械学習')
  })

  // Test 4: maxLengthで切り詰める
  it('should truncate content exceeding maxLength', () => {
    const longContent = 'あ'.repeat(3000)
    const result = selectRelevantContent(longContent, 'test', 100)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result.endsWith('...')).toBe(true)
  })

  // Test 5: 導入部分を常に含む
  it('should always include introduction paragraphs', () => {
    const content = `最初の導入文です。

二番目の導入文です。

本文です。`

    const result = selectRelevantContent(content, 'キーワード', 2000)
    expect(result).toContain('最初の導入文')
    expect(result).toContain('二番目の導入文')
  })
})
