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
    const reasoningEffort = body.reasoningEffort || 'medium' // 'minimal' | 'medium' | 'high'
    const textVerbosity = body.textVerbosity || 'medium' // 'terse' | 'medium' | 'verbose'

    // プロバイダーの選択（デフォルトはopenai、なければgroq）
    const provider: AIProvider = body.provider || (openaiApiKey ? 'openai' : 'groq')

    // プロバイダーに応じたAPIキーチェック
    if (provider === 'groq' && !groqApiKey) {
      return NextResponse.json({ error: 'Groq APIキーが設定されていません。環境変数GROQ_API_KEYを設定してください。' }, { status: 500 })
    }

    if (provider === 'openai' && !openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを設定してください。' }, { status: 500 })
    }

    // プロバイダーに応じたAIクライアントを設定
    const groq = groqApiKey ? createGroq({ apiKey: groqApiKey }) : null
    const openai = openaiApiKey ? createOpenAI({
      apiKey: openaiApiKey,
      baseURL: openaiBaseUrl,
    }) : null

    // 使用するモデルを選択（GPT-5系はResponses APIを使用）
    const isGpt5Model = openaiModel.startsWith('gpt-5')
    // gpt-5.2-proはreasoning/verbosityどちらも非対応
    const isProModel = openaiModel === 'gpt-5.2-pro'
    // 推論サポート: gpt-5.2、gpt-5-mini、gpt-5-nano（proは除く）
    const supportsReasoning = !isProModel && (openaiModel === 'gpt-5.2' || openaiModel.startsWith('gpt-5-mini') || openaiModel.startsWith('gpt-5-nano'))
    // verbosityサポート: proモデル以外
    const supportsVerbosity = !isProModel
    const model = provider === 'openai' && openai
      ? (isGpt5Model ? openai.responses(openaiModel) : openai(openaiModel))
      : groq
        ? groq('llama-3.3-70b-versatile')
        : null

    if (!model) {
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
          let aiMessages: ModelMessage[] = []

          if (!isFollowUp) {
            // 初回クエリ
            aiMessages = [
              {
                role: systemRole as 'system',
                content: `あなたは情報検索を手助けする親切なアシスタントです。

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
              },
              {
                role: 'user',
                content: `このクエリに答えてください: "${query}"\n\n以下のソースに基づいて:\n${context}`
              }
            ]
          } else {
            // フォローアップ質問
            aiMessages = [
              {
                role: systemRole as 'system',
                content: `あなたは会話を続ける親切なアシスタントです。

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
              },
              ...convertToModelMessages(messages.slice(0, -1)),
              {
                role: 'user',
                content: `このクエリに答えてください: "${query}"\n\n以下のソースに基づいて:\n${context}`
              }
            ]
          }

          // ストリーミングでテキスト生成
          const result = streamText({
            model: model as any,
            messages: aiMessages,
            temperature: 0.7,
            maxRetries: 2,
            // GPT-5 Responses API用のパラメータ（対応モデルのみ）
            ...(isGpt5Model && (supportsReasoning || supportsVerbosity) && {
              providerOptions: {
                openai: {
                  ...(supportsReasoning && { reasoningEffort: reasoningEffort }),
                  ...(supportsVerbosity && { textVerbosity: textVerbosity }),
                }
              }
            })
          })

          // AIストリームをUIMessageストリームにマージ
          writer.merge(result.toUIMessageStream())

          // フォローアップ質問生成のために完全な回答を取得
          const fullAnswer = await result.text

          // フォローアップ質問を生成
          try {
            const followUpResponse = await generateText({
              model: model as any,
              messages: [
                {
                  role: systemRole as 'system',
                  content: `クエリと回答に基づいて、5つの自然なフォローアップ質問を生成してください。

                  以下の場合のみ質問を生成してください:
                  - 単純な挨拶や基本的な確認ではない
                  - 自然で、無理のない質問
                  - 本当に役立つ質問で、埋め合わせではない
                  - トピックと利用可能なソースに焦点を当てた質問

                  クエリがフォローアップを必要としない場合は、空の応答を返してください。
                  ${isFollowUp ? '会話履歴全体を考慮し、以前の質問を繰り返さないでください。' : ''}
                  質問のみを返してください。1行に1つ、番号や箇条書きは不要です。
                  日本語で質問を生成してください。`
                },
                {
                  role: 'user',
                  content: `クエリ: ${query}\n\n提供された回答: ${fullAnswer.substring(0, 500)}...\n\n${sources.length > 0 ? `利用可能なソース: ${sources.map(s => s.title).join(', ')}\n\n` : ''}このトピックについてさらに学ぶための、異なる角度からの5つの多様なフォローアップ質問を生成してください。`
                }
              ],
              temperature: 0.7,
              maxRetries: 2
            })

            // フォローアップ質問を処理
            const followUpQuestions = followUpResponse.text
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
            // フォローアップ質問の生成エラー（無視）
          }

        } catch (error) {
          // エラー処理
          const errorMessage = error instanceof Error ? error.message : '不明なエラー'

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
