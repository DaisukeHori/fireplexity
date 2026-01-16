# GPT-5 ストリーミング実装ガイド

## 概要

OpenAI GPT-5.2 Responses APIをAI SDK v5と統合する際に発生した問題と解決策のドキュメント。

## 背景

- **AI SDK v5**: Vercelの`ai`パッケージ（v5系）
- **GPT-5.2**: OpenAIの新しいResponses API（v3仕様）を使用
- **問題**: AI SDK v5はResponses API v3仕様をネイティブサポートしていないため、直接fetchが必要

## 発生した問題

### 問題1: UIにテキストが表示されない

**症状**:
- バックエンドのログでは正常にテキストがストリーミングされている
- ブラウザのDevToolsでfetchリクエストのレスポンスは受信している
- しかしUIには何も表示されない

**原因**:
`createUIMessageStream`の`writer.write()`に渡すチャンク形式が不正だった。

**試した方法（失敗）**:

```typescript
// 方法1: text-deltaのみ送信（失敗）
writer.write({
  type: 'text-delta',
  delta: chunk,
  id: messageId
})

// 方法2: Data Stream Protocol形式で直接ストリーム作成（失敗）
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`))
  }
})
writer.merge(stream)

// 方法3: 独自Responseを返す（部分的に動作したがデータパーツが機能しない）
return new Response(stream, {
  headers: { 'X-Vercel-AI-Data-Stream': 'v1' }
})
```

**解決策**:
UIMessageStreamプロトコルの完全なシーケンスを実装：

```typescript
const textId = `text-gpt5-${Date.now()}`

// 1. text-startを送信（必須）
writer.write({
  type: 'text-start',
  id: textId
})

// 2. text-deltaを各チャンクで送信
for await (const chunk of textStream) {
  writer.write({
    type: 'text-delta',
    delta: chunk,
    id: textId
  })
}

// 3. text-endを送信（必須）
writer.write({
  type: 'text-end',
  id: textId
})
```

### 問題2: Brave API 429レート制限

**症状**:
- 検索結果が空で返される
- コンテキストがLLMに渡されない

**原因**:
Brave Search APIの429 Rate Limitエラー

**解決策**:
リトライロジックの実装（最大10回、exponential backoff）：

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 10,
  label: string = 'Brave'
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options)

    if (response.status === 429 && attempt < maxRetries) {
      const waitTime = Math.min((attempt + 1) * 1000, 5000)
      console.log(`[${label}] 429 Rate Limited, retrying in ${waitTime}ms`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      continue
    }

    return response
  }

  throw lastError || new Error('Max retries exceeded')
}
```

### 問題3: ニュース結果がコンテキストに含まれない

**症状**:
- Web検索が429エラーでも、News APIは200を返すことがある
- しかしニュース結果がLLMコンテキストに含まれていない

**解決策**:
ニュース結果もコンテキストに追加：

```typescript
const newsContext = newsResults
  .map((news, index) => {
    const newsIndex = sources.length + index + 1
    return `[${newsIndex}] [ニュース] ${news.title}\nURL: ${news.url}\n${news.description || ''}`
  })
  .join('\n\n---\n\n')

// WebコンテキストとNewsコンテキストを結合
let context = ''
if (webContext && newsContext) {
  context = webContext + '\n\n---\n\n' + newsContext
} else if (webContext) {
  context = webContext
} else if (newsContext) {
  context = newsContext
}
```

## UIMessageStreamプロトコル仕様

### チャンクタイプ

AI SDK v5の`createUIMessageStream`で使用できる主要なチャンクタイプ：

| タイプ | 用途 | 必須フィールド |
|--------|------|----------------|
| `text-start` | テキストブロック開始 | `id` |
| `text-delta` | テキストチャンク | `id`, `delta` |
| `text-end` | テキストブロック終了 | `id` |
| `data-{name}` | カスタムデータ | `id`, `data` |
| `start` | メッセージ開始 | - |
| `finish` | メッセージ終了 | - |

### カスタムデータパーツ

```typescript
// ソース情報
writer.write({
  type: 'data-sources',
  id: 'sources-1',
  data: { sources, newsResults, imageResults }
})

// ステータス更新（transient: trueで一時的）
writer.write({
  type: 'data-status',
  id: 'status-1',
  data: { message: '検索中...' },
  transient: true
})

// フォローアップ質問
writer.write({
  type: 'data-followup',
  id: 'followup-1',
  data: { questions: ['質問1', '質問2'] }
})
```

## フロントエンド処理

### メッセージからテキスト抽出

```typescript
function getMessageContent(message: UIMessage): string {
  if (!message.parts) return ''
  return message.parts
    .filter((part: any) => part.type === 'text')
    .map((part: any) => part.text)
    .join('')
}
```

### データパーツ処理

```typescript
lastMessage.parts.forEach((part: any) => {
  if (part.type === 'data-sources' && part.data) {
    // ソース情報を抽出
    const { sources, newsResults, imageResults } = part.data
  }

  if (part.type === 'data-followup' && part.data) {
    // フォローアップ質問を抽出
    const { questions } = part.data
  }
})
```

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  useChat() → messages[] → parts[] → getMessageContent()     │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ UIMessageStream Protocol
                              │
┌─────────────────────────────────────────────────────────────┐
│                    API Route (Next.js)                       │
│                                                              │
│  ┌──────────────────┐    ┌────────────────────────────────┐ │
│  │   GPT-5 Models   │    │      Non-GPT-5 Models          │ │
│  │                  │    │                                │ │
│  │  streamOpenAI    │    │  streamText() from AI SDK      │ │
│  │  Responses()     │    │         ↓                      │ │
│  │       ↓          │    │  result.toUIMessageStream()    │ │
│  │  writer.write()  │    │         ↓                      │ │
│  │  - text-start    │    │  writer.merge()                │ │
│  │  - text-delta    │    │                                │ │
│  │  - text-end      │    │                                │ │
│  └──────────────────┘    └────────────────────────────────┘ │
│                                                              │
│  createUIMessageStream() → Response                          │
└─────────────────────────────────────────────────────────────┘
```

## 重要なポイント

1. **text-start/text-endは必須**: `text-delta`だけでは不十分。開始と終了のシグナルが必要。

2. **同一idの使用**: `text-start`, `text-delta`, `text-end`は同じ`id`を使用する必要がある。

3. **writer.merge()の用途**: AI SDKの`toUIMessageStream()`が返すストリームをマージする場合に使用。カスタムストリームの場合は形式に注意。

4. **Data Stream Protocol**: `0:`（テキスト）、`8:`（データ）、`d:`（完了）などのプレフィックスを使用するが、`createUIMessageStream`を使う場合は抽象化されている。

5. **デバッグのコツ**:
   - バックエンドのログで実際に送信されているデータを確認
   - ブラウザのDevToolsでfetchレスポンスを確認
   - フロントエンドで`message.parts`の構造をログ出力して確認

## 関連ファイル

- `app/api/fireplexity/search/route.ts` - APIルート（ストリーミング実装）
- `lib/scraper/search.ts` - Brave Search API（リトライロジック）
- `app/page.tsx` - フロントエンド（useChat、データ処理）
- `app/chat-interface.tsx` - UIコンポーネント（メッセージ表示）
