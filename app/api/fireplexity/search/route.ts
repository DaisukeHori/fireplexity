import { NextResponse } from 'next/server'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, generateText, createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages } from 'ai'
import type { ModelMessage } from 'ai'
import { detectCompanyTicker } from '@/lib/company-ticker-map'
import { selectRelevantContent } from '@/lib/content-selection'
import { integratedSearch } from '@/lib/scraper'

// AIプロバイダーの型定義
type AIProvider = 'groq' | 'openai'

// OpenAI Responses APIのストリーミングレスポンスを処理
async function* streamOpenAIResponses(
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    reasoningEffort?: string
    textVerbosity?: string
    supportsReasoning: boolean
    supportsVerbosity: boolean
    isProModel: boolean
  }
): AsyncGenerator<string, void, unknown> {
  const url = baseUrl ? `${baseUrl}/responses` : 'https://api.openai.com/v1/responses'

  // メッセージをResponses API形式に変換（content配列形式）
  const input = messages.map(m => ({
    role: m.role,
    content: [
      {
        type: 'input_text',
        text: m.content
      }
    ]
  }))

  // リクエストボディを構築
  const requestBody: Record<string, unknown> = {
    model,
    input,
    stream: true,
    store: true,
  }

  // textパラメータ（verbosity対応モデルのみverbosityを含める）
  if (options.supportsVerbosity && options.textVerbosity) {
    requestBody.text = {
      format: { type: 'text' },
      verbosity: options.textVerbosity
    }
  } else {
    requestBody.text = {
      format: { type: 'text' }
    }
  }

  // reasoningパラメータ
  if (options.isProModel) {
    // gpt-5.2-pro: summaryのみ
    requestBody.reasoning = { summary: 'auto' }
  } else if (options.supportsReasoning && options.reasoningEffort && options.reasoningEffort !== 'none') {
    // 他のモデル: effort + summary
    requestBody.reasoning = {
      effort: options.reasoningEffort,
      summary: 'auto'
    }
  }

  console.log('[OpenAI Responses API] Request:', JSON.stringify(requestBody, null, 2))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OpenAI Responses API] Error:', response.status, errorText)
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
  }

  console.log('[OpenAI Responses API] Response status:', response.status)

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log('[OpenAI Responses API] Stream done, total chunks:', chunkCount)
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') {
          console.log('[OpenAI Responses API] Received [DONE]')
          continue
        }

        try {
          const parsed = JSON.parse(data)
          // 最初の数チャンクとテキストデルタをログ出力
          if (chunkCount < 5 || parsed.type?.includes('text') || parsed.type?.includes('delta')) {
            console.log('[OpenAI Responses API] Chunk:', parsed.type, JSON.stringify(parsed).substring(0, 300))
          }
          chunkCount++

          // Responses APIのストリーミング形式を処理
          // テキスト出力のデルタ
          if (parsed.type === 'response.output_text.delta') {
            yield parsed.delta || ''
          }
          // コンテンツパートのデルタ
          else if (parsed.type === 'response.content_part.delta' && parsed.delta?.text) {
            yield parsed.delta.text
          }
          // 出力アイテムのテキストデルタ
          else if (parsed.type === 'response.output_item.delta' && parsed.delta?.content) {
            yield parsed.delta.content
          }
          // テキストデルタ（一般的な形式）
          else if (parsed.type === 'response.text.delta' && parsed.delta) {
            yield parsed.delta
          }
          // アウトプットテキストのデルタ（別形式）
          else if (parsed.type === 'response.output.text.delta' && parsed.delta) {
            yield parsed.delta
          }
          // contentフィールドに直接テキストがある場合
          else if (parsed.delta?.content?.[0]?.text) {
            yield parsed.delta.content[0].text
          }
          // 旧Chat Completions形式のフォールバック
          else if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content
          }
        } catch {
          // JSON解析エラーは無視
        }
      }
    }
  }
}

// OpenAI Responses APIで非ストリーミング生成
async function generateOpenAIResponses(
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    supportsReasoning: boolean
    supportsVerbosity: boolean
    isProModel: boolean
  }
): Promise<string> {
  const url = baseUrl ? `${baseUrl}/responses` : 'https://api.openai.com/v1/responses'

  // メッセージをResponses API形式に変換（content配列形式）
  const input = messages.map(m => ({
    role: m.role,
    content: [
      {
        type: 'input_text',
        text: m.content
      }
    ]
  }))

  const requestBody: Record<string, unknown> = {
    model,
    input,
    stream: false,
    store: true,
    text: {
      format: { type: 'text' }
    },
  }

  // reasoningパラメータ
  if (options.isProModel) {
    requestBody.reasoning = { summary: 'auto' }
  } else if (options.supportsReasoning) {
    requestBody.reasoning = { effort: 'medium', summary: 'auto' }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  // Responses APIのレスポンス形式
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text') {
            return content.text || ''
          }
        }
      }
    }
  }
  // フォールバック
  return data.output_text || data.choices?.[0]?.message?.content || ''
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messages = body.messages || []

    // v5メッセージ構造からクエリを抽出
    let query = body.query
    if (!query && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.parts) {
        const textParts = lastMessage.parts.filter((p: any) => p.type === 'text')
        query = textParts.map((p: any) => p.text).join(' ')
      } else if (lastMessage.content) {
        query = lastMessage.content
      }
    }

    if (!query) {
      return NextResponse.json({ error: 'クエリが必要です' }, { status: 400 })
    }

    // APIキーとベースURLを取得
    const groqApiKey = process.env.GROQ_API_KEY
    const openaiApiKey = body.openaiApiKey || process.env.OPENAI_API_KEY
    const openaiBaseUrl = body.openaiBaseUrl || process.env.OPENAI_API_BASE_URL || undefined
    const openaiModel = body.openaiModel || process.env.OPENAI_MODEL || 'gpt-5.2'
    const braveApiKey = process.env.BRAVE_API_KEY

    // GPT-5.2 Responses API パラメータ
    const reasoningEffort = body.reasoningEffort || 'medium'
    const textVerbosity = body.textVerbosity || 'medium'

    // プロバイダーの選択（デフォルトはopenai、なければgroq）
    const provider: AIProvider = body.provider || (openaiApiKey ? 'openai' : 'groq')

    // プロバイダーに応じたAPIキーチェック
    if (provider === 'groq' && !groqApiKey) {
      return NextResponse.json({ error: 'Groq APIキーが設定されていません。環境変数GROQ_API_KEYを設定してください。' }, { status: 500 })
    }

    if (provider === 'openai' && !openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを設定してください。' }, { status: 500 })
    }

    // モデル判定
    const isGpt5Model = openaiModel.startsWith('gpt-5')
    // gpt-5.2-proはreasoning/verbosityどちらも非対応
    const isProModel = openaiModel === 'gpt-5.2-pro'
    // 推論サポート: gpt-5.2、gpt-5-mini、gpt-5-nano（proは除く）
    const supportsReasoning = !isProModel && (openaiModel === 'gpt-5.2' || openaiModel.startsWith('gpt-5-mini') || openaiModel.startsWith('gpt-5-nano'))
    // verbosityサポート: proモデル以外
    const supportsVerbosity = !isProModel

    // Groq用のAIクライアント（GPT-5以外の場合）
    const groq = groqApiKey ? createGroq({ apiKey: groqApiKey }) : null
    const openai = (provider === 'openai' && !isGpt5Model && openaiApiKey) ? createOpenAI({
      apiKey: openaiApiKey,
      baseURL: openaiBaseUrl,
    }) : null

    // GPT-5以外のモデル用
    const aiSdkModel = provider === 'openai' && openai
      ? openai(openaiModel)
      : groq
        ? groq('llama-3.3-70b-versatile')
        : null

    // GPT-5モデルの場合はfetch、それ以外はAI SDKを使用
    const useDirectFetch = provider === 'openai' && isGpt5Model && openaiApiKey

    if (!useDirectFetch && !aiSdkModel) {
      return NextResponse.json({ error: '利用可能なAIプロバイダーがありません' }, { status: 500 })
    }

    // フォローアップかどうかを判定
    const isFollowUp = messages.length > 2

    // UIMessageストリームを作成
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        try {
          let sources: Array<{
            url: string
            title: string
            description?: string
            content?: string
            markdown?: string
            image?: string
            favicon?: string
            siteName?: string
          }> = []
          let newsResults: Array<{
            url: string
            title: string
            description?: string
            publishedDate?: string
            source?: string
            image?: string
          }> = []
          let imageResults: Array<{
            url: string
            title: string
            thumbnail?: string
            source?: string
            width?: number
            height?: number
          }> = []
          let context = ''

          // ステータス更新を送信
          writer.write({
            type: 'data-status',
            id: 'status-1',
            data: { message: '検索を開始しています...' },
            transient: true
          })

          writer.write({
            type: 'data-status',
            id: 'status-2',
            data: { message: 'ウェブを検索中...' },
            transient: true
          })

          // 内蔵検索エンジンを使用（Brave API優先、なければDuckDuckGo）
          const searchResult = await integratedSearch(query, {
            numResults: 6,
            includeNews: true,
            includeImages: true,
            scrapeContent: true,
            braveApiKey,
          })

          // Web検索結果を変換
          sources = searchResult.web.map((item) => ({
            url: item.url,
            title: item.title,
            description: item.description,
            content: item.content,
            markdown: item.markdown,
            favicon: item.favicon,
            image: item.image,
            siteName: item.siteName,
          }))

          // ニュース結果を変換
          newsResults = searchResult.news.map((item) => ({
            url: item.url,
            title: item.title,
            description: item.description,
            publishedDate: item.date,
            source: item.source,
            image: item.imageUrl,
          }))

          // 画像結果を変換
          imageResults = searchResult.images.map((item) => ({
            url: item.url,
            title: item.title,
            thumbnail: item.imageUrl,
            source: item.source,
            width: item.width,
            height: item.height,
          }))

          // ソースをデータパートとして送信
          writer.write({
            type: 'data-sources',
            id: 'sources-1',
            data: {
              sources,
              newsResults,
              imageResults
            }
          })

          // ソースが表示されるまで少し待機
          await new Promise(resolve => setTimeout(resolve, 300))

          // ステータス更新
          writer.write({
            type: 'data-status',
            id: 'status-3',
            data: { message: 'ソースを分析して回答を生成中...' },
            transient: true
          })

          // 企業名から株価ティッカーを検出
          const ticker = detectCompanyTicker(query)
          if (ticker) {
            writer.write({
              type: 'data-ticker',
              id: 'ticker-1',
              data: { symbol: ticker }
            })
          }

          // ソースからコンテキストを準備
          context = sources
            .map((source, index) => {
              const content = source.markdown || source.content || source.description || ''
              const relevantContent = selectRelevantContent(content, query, 2000)
              return `[${index + 1}] ${source.title}\nURL: ${source.url}\n${relevantContent}`
            })
            .join('\n\n---\n\n')

          // AIへのメッセージを準備（GPT-5系はdeveloperロール、それ以外はsystemロール）
          const systemRole = isGpt5Model ? 'developer' : 'system'

          const systemPrompt = !isFollowUp
            ? `あなたは情報検索を手助けする親切なアシスタントです。

              重要なフォーマットルール:
              - 通常の数字にLaTeX/数式構文（$...$）を使わないでください
              - すべての数字はプレーンテキストで書いてください: "100万円" であり "$100万$ 円" ではありません
              - 数式構文は本当に必要な数学の方程式にのみ使用してください

              回答スタイル:
              - 挨拶（こんにちは、など）には温かく応答し、どのようにお手伝いできるか尋ねてください
              - シンプルな質問には、直接的で簡潔な回答をしてください
              - 複雑なトピックには、必要な場合にのみ詳細な説明を提供してください
              - ユーザーのエネルギーレベルに合わせてください - 短い質問には短く

              フォーマット:
              - 読みやすさのために適切なマークダウンを使用してください
              - 自然で会話的な回答を心がけてください
              - 特定のソースを参照する場合は[1]、[2]などの引用を含めてください
              - 引用はソースの順序に対応させてください（最初のソース = [1]、2番目 = [2]など）
              - 日本語で回答してください`
            : `あなたは会話を続ける親切なアシスタントです。

              重要なフォーマットルール:
              - 通常の数字にLaTeX/数式構文（$...$）を使わないでください
              - すべての数字はプレーンテキストで書いてください

              注意事項:
              - 以前と同じ会話のトーンを維持してください
              - 以前の文脈を自然に活用してください
              - ユーザーのコミュニケーションスタイルに合わせてください
              - 明確さを助けるためにマークダウンを使用してください
              - [1]、[2]などの引用を含めてください
              - 日本語で回答してください`

          const userPrompt = `このクエリに答えてください: "${query}"\n\n以下のソースに基づいて:\n${context}`

          let fullAnswer = ''

          if (useDirectFetch) {
            // GPT-5モデル: 直接fetchでResponses APIを使用
            const directMessages = [
              { role: systemRole, content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]

            const textStream = streamOpenAIResponses(
              openaiApiKey!,
              openaiBaseUrl,
              openaiModel,
              directMessages,
              { reasoningEffort, textVerbosity, supportsReasoning, supportsVerbosity, isProModel }
            )

            for await (const chunk of textStream) {
              fullAnswer += chunk
              writer.write({
                type: 'text-delta',
                id: 'main-text',
                delta: chunk
              })
            }
          } else {
            // AI SDKを使用
            const aiMessages: ModelMessage[] = [
              { role: systemRole as 'system', content: systemPrompt },
              ...(isFollowUp ? convertToModelMessages(messages.slice(0, -1)) : []),
              { role: 'user', content: userPrompt }
            ]

            const result = streamText({
              model: aiSdkModel as any,
              messages: aiMessages,
              temperature: 0.7,
              maxRetries: 2,
            })

            // AIストリームをUIMessageストリームにマージ
            writer.merge(result.toUIMessageStream())
            fullAnswer = await result.text
          }

          // フォローアップ質問を生成
          try {
            const followUpSystemPrompt = `クエリと回答に基づいて、5つの自然なフォローアップ質問を生成してください。

              以下の場合のみ質問を生成してください:
              - 単純な挨拶や基本的な確認ではない
              - 自然で、無理のない質問
              - 本当に役立つ質問で、埋め合わせではない
              - トピックと利用可能なソースに焦点を当てた質問

              クエリがフォローアップを必要としない場合は、空の応答を返してください。
              ${isFollowUp ? '会話履歴全体を考慮し、以前の質問を繰り返さないでください。' : ''}
              質問のみを返してください。1行に1つ、番号や箇条書きは不要です。
              日本語で質問を生成してください。`

            const followUpUserPrompt = `クエリ: ${query}\n\n提供された回答: ${fullAnswer.substring(0, 500)}...\n\n${sources.length > 0 ? `利用可能なソース: ${sources.map(s => s.title).join(', ')}\n\n` : ''}このトピックについてさらに学ぶための、異なる角度からの5つの多様なフォローアップ質問を生成してください。`

            let followUpText = ''

            if (useDirectFetch) {
              // GPT-5: 直接fetchで生成
              followUpText = await generateOpenAIResponses(
                openaiApiKey!,
                openaiBaseUrl,
                openaiModel,
                [
                  { role: systemRole, content: followUpSystemPrompt },
                  { role: 'user', content: followUpUserPrompt }
                ],
                { supportsReasoning, supportsVerbosity, isProModel }
              )
            } else {
              // AI SDK
              const followUpResponse = await generateText({
                model: aiSdkModel as any,
                messages: [
                  { role: systemRole as 'system', content: followUpSystemPrompt },
                  { role: 'user', content: followUpUserPrompt }
                ],
                temperature: 0.7,
                maxRetries: 2
              })
              followUpText = followUpResponse.text
            }

            // フォローアップ質問を処理
            const followUpQuestions = followUpText
              .split('\n')
              .map((q: string) => q.trim())
              .filter((q: string) => q.length > 0)
              .slice(0, 5)

            // フォローアップ質問をデータパートとして送信
            writer.write({
              type: 'data-followup',
              id: 'followup-1',
              data: { questions: followUpQuestions }
            })
          } catch (followUpError) {
            console.warn('[FollowUp] Error:', followUpError)
          }

        } catch (error) {
          // エラー処理
          const errorMessage = error instanceof Error ? error.message : '不明なエラー'
          console.error('[AI Generation] Error:', errorMessage, error)

          // ユーザーフレンドリーなエラーメッセージ
          const errorResponses: Record<number, { error: string; suggestion?: string }> = {
            429: {
              error: 'レート制限に達しました',
              suggestion: 'リクエストが多すぎます。しばらく待ってから再試行してください。'
            },
            504: {
              error: 'リクエストタイムアウト',
              suggestion: '検索に時間がかかりすぎました。より簡単なクエリを試してください。'
            }
          }

          const statusCode = error && typeof error === 'object' && 'status' in error
            ? (error as any).status
            : undefined

          const errorResponse = statusCode && errorResponses[statusCode]
            ? errorResponses[statusCode]
            : { error: errorMessage }

          // エラーメッセージをUIに表示
          writer.write({
            type: 'data-error',
            id: 'error-1',
            data: {
              error: errorResponse.error,
              ...(errorResponse.suggestion ? { suggestion: errorResponse.suggestion } : {}),
              ...(statusCode ? { statusCode } : {})
            },
            transient: true
          })

          // エラー時もテキストとして表示
          writer.write({
            type: 'text-delta',
            id: 'error-text',
            delta: `\n\n**エラーが発生しました:** ${errorResponse.error}${errorResponse.suggestion ? `\n${errorResponse.suggestion}` : ''}`
          })
        }
      }
    })

    return createUIMessageStreamResponse({ stream })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json(
      { error: '検索に失敗しました', message: errorMessage },
      { status: 500 }
    )
  }
}
