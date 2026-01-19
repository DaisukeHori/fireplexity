/**
 * 多階層検索アルゴリズム
 *
 * Perplexityのような高度な検索システムを実現するため、
 * 2-3階層の反復的な検索を行う
 */

import { integratedSearch, type IntegratedSearchResult } from './scraper'
import { selectRelevantContent } from './content-selection'

// クエリの意図タイプ
export type QueryIntent =
  | 'factual'        // 事実確認（「〜とは何か」）
  | 'comparison'     // 比較（「AとBの違い」）
  | 'howto'          // 方法（「〜のやり方」）
  | 'opinion'        // 意見・レビュー
  | 'current_events' // 時事・ニュース
  | 'technical'      // 技術的な詳細
  | 'comprehensive'  // 包括的な調査

// クエリの複雑度
export type QueryComplexity = 'simple' | 'medium' | 'complex'

// クエリ分析結果
export interface QueryAnalysis {
  intent: QueryIntent
  complexity: QueryComplexity
  suggestedDepth: 1 | 2 | 3  // 推奨検索深度
  aspects: string[]          // クエリが求める側面
  keywords: string[]         // 重要なキーワード
}

// 検索階層の結果
export interface LayerResult {
  layer: number
  query: string
  sources: SourceInfo[]
  newsResults: NewsInfo[]
  coverage: number  // 0-1: クエリのカバー率
  gaps: string[]    // 不足している情報
}

// ソース情報
export interface SourceInfo {
  url: string
  title: string
  description?: string
  content?: string
  markdown?: string
  favicon?: string
  image?: string
  siteName?: string
  relevanceScore?: number
  layer: number  // どの階層で取得したか
}

// ニュース情報
export interface NewsInfo {
  url: string
  title: string
  description?: string
  publishedDate?: string
  source?: string
  image?: string
  layer: number
}

// 多階層検索結果
export interface MultiLayerSearchResult {
  layers: LayerResult[]
  allSources: SourceInfo[]
  allNews: NewsInfo[]
  imageResults: Array<{
    url: string
    title: string
    thumbnail?: string
    source?: string
    width?: number
    height?: number
  }>
  totalSearches: number
  finalCoverage: number
}

// 検索オプション
export interface MultiLayerSearchOptions {
  maxLayers?: number         // 最大階層数 (default: 2)
  minCoverage?: number       // 最低カバー率 (default: 0.7)
  numResultsPerLayer?: number // 各階層の検索件数 (default: 4-6)
  braveApiKey?: string
  analyzeQuery?: (query: string) => Promise<QueryAnalysis>
  evaluateCoverage?: (query: string, sources: SourceInfo[], analysis: QueryAnalysis) => Promise<{
    coverage: number
    gaps: string[]
    subQueries: string[]
  }>
}

/**
 * クエリを分析して意図と複雑度を判定（LLMを使わない簡易版）
 */
export function analyzeQuerySimple(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase()

  // 意図の判定
  let intent: QueryIntent = 'factual'
  if (lowerQuery.includes('比較') || lowerQuery.includes('違い') || lowerQuery.includes('vs')) {
    intent = 'comparison'
  } else if (lowerQuery.includes('方法') || lowerQuery.includes('やり方') || lowerQuery.includes('how')) {
    intent = 'howto'
  } else if (lowerQuery.includes('最新') || lowerQuery.includes('ニュース') || lowerQuery.includes('2024') || lowerQuery.includes('2025')) {
    intent = 'current_events'
  } else if (lowerQuery.includes('レビュー') || lowerQuery.includes('おすすめ') || lowerQuery.includes('評価')) {
    intent = 'opinion'
  } else if (lowerQuery.includes('実装') || lowerQuery.includes('コード') || lowerQuery.includes('アルゴリズム')) {
    intent = 'technical'
  }

  // 複雑度の判定
  const wordCount = query.split(/\s+/).length
  const hasMultipleConcepts = (query.match(/と|や|および|または|、/g) || []).length >= 2
  const hasQuestionMarker = /なぜ|どのように|何が|どう/.test(query)

  let complexity: QueryComplexity = 'simple'
  if (wordCount > 15 || hasMultipleConcepts || (hasQuestionMarker && wordCount > 8)) {
    complexity = 'complex'
  } else if (wordCount > 8 || hasMultipleConcepts) {
    complexity = 'medium'
  }

  // 推奨検索深度
  let suggestedDepth: 1 | 2 | 3 = 1
  if (complexity === 'complex' || intent === 'comparison' || intent === 'comprehensive') {
    suggestedDepth = 3
  } else if (complexity === 'medium' || intent === 'technical' || intent === 'howto') {
    suggestedDepth = 2
  }

  // 側面とキーワードの抽出
  const keywords = query
    .split(/[\s、。！？]+/)
    .filter(word => word.length > 2)
    .filter(word => !['について', 'とは', 'ですか', 'ください', 'ありますか'].includes(word))

  const aspects = detectQueryAspects(query, intent)

  return {
    intent,
    complexity,
    suggestedDepth,
    aspects,
    keywords
  }
}

/**
 * クエリが求める側面を検出
 */
function detectQueryAspects(query: string, intent: QueryIntent): string[] {
  const aspects: string[] = []

  // 共通の側面
  if (/とは|何|what/i.test(query)) aspects.push('definition')
  if (/なぜ|理由|why/i.test(query)) aspects.push('reason')
  if (/どのように|方法|how/i.test(query)) aspects.push('method')
  if (/いつ|日時|when/i.test(query)) aspects.push('timing')
  if (/どこ|場所|where/i.test(query)) aspects.push('location')
  if (/誰|who/i.test(query)) aspects.push('person')

  // 意図に基づく側面
  switch (intent) {
    case 'comparison':
      aspects.push('similarities', 'differences', 'pros_cons')
      break
    case 'howto':
      aspects.push('steps', 'requirements', 'tips')
      break
    case 'technical':
      aspects.push('implementation', 'examples', 'best_practices')
      break
    case 'opinion':
      aspects.push('reviews', 'recommendations', 'ratings')
      break
    case 'current_events':
      aspects.push('latest_news', 'timeline', 'impact')
      break
  }

  return aspects
}

/**
 * ギャップを分析してサブクエリを生成（LLMを使わない簡易版）
 */
export function generateSubQueries(
  originalQuery: string,
  analysis: QueryAnalysis,
  existingSources: SourceInfo[],
  layer: number
): string[] {
  const subQueries: string[] = []
  const keywords = analysis.keywords

  // 第2階層: より具体的なクエリ
  if (layer === 1) {
    // キーワードの組み合わせで深掘り
    if (keywords.length >= 2) {
      subQueries.push(`${keywords[0]} ${keywords[1]} 詳細`)
      subQueries.push(`${keywords[0]} 具体例 事例`)
    }

    // 意図に基づくサブクエリ
    switch (analysis.intent) {
      case 'comparison':
        const parts = originalQuery.split(/と|vs|versus/i)
        if (parts.length >= 2) {
          subQueries.push(`${parts[0].trim()} メリット デメリット`)
          subQueries.push(`${parts[1].trim()} メリット デメリット`)
        }
        break
      case 'howto':
        subQueries.push(`${keywords[0]} 手順 ステップ`)
        subQueries.push(`${keywords[0]} 初心者 入門`)
        break
      case 'technical':
        subQueries.push(`${keywords[0]} 実装 サンプルコード`)
        subQueries.push(`${keywords[0]} ベストプラクティス`)
        break
      case 'current_events':
        subQueries.push(`${keywords[0]} 最新ニュース 2025`)
        break
      default:
        subQueries.push(`${keywords[0]} 解説 わかりやすく`)
    }
  }

  // 第3階層: 専門的・補完的なクエリ
  if (layer === 2) {
    // 既存ソースから得られなかった情報を補完
    subQueries.push(`${keywords[0]} 専門家 見解`)
    subQueries.push(`${keywords[0]} 最新研究 論文`)

    // 異なるソースタイプを狙う
    if (!existingSources.some(s => s.url.includes('wikipedia'))) {
      subQueries.push(`${keywords[0]} site:wikipedia.org`)
    }
  }

  // 最大3クエリに制限
  return subQueries.slice(0, 3)
}

/**
 * 情報カバー率を評価（LLMを使わない簡易版）
 */
export function evaluateCoverageSimple(
  query: string,
  sources: SourceInfo[],
  analysis: QueryAnalysis
): { coverage: number; gaps: string[] } {
  const gaps: string[] = []
  let coveredAspects = 0

  const allContent = sources
    .map(s => `${s.title} ${s.description || ''} ${s.content || ''}`)
    .join(' ')
    .toLowerCase()

  // 各側面がカバーされているかチェック
  for (const aspect of analysis.aspects) {
    const aspectKeywords: Record<string, string[]> = {
      definition: ['とは', '定義', '意味', 'is a', 'refers to'],
      reason: ['理由', 'なぜ', 'because', '原因'],
      method: ['方法', 'やり方', '手順', 'how to', 'steps'],
      timing: ['いつ', '日時', '期間', 'when', 'date'],
      location: ['場所', 'どこ', 'where', 'location'],
      similarities: ['共通点', '同じ', 'similar'],
      differences: ['違い', '異なる', 'difference'],
      pros_cons: ['メリット', 'デメリット', '利点', '欠点'],
      steps: ['ステップ', '手順', '順番'],
      implementation: ['実装', 'コード', 'implementation'],
      examples: ['例', 'サンプル', 'example'],
      reviews: ['レビュー', '評価', '口コミ'],
      latest_news: ['最新', 'ニュース', '発表'],
    }

    const keywords = aspectKeywords[aspect] || [aspect]
    const isCovered = keywords.some(kw => allContent.includes(kw))

    if (isCovered) {
      coveredAspects++
    } else {
      gaps.push(aspect)
    }
  }

  // キーワードのカバー率も考慮
  const keywordCoverage = analysis.keywords.filter(kw =>
    allContent.includes(kw.toLowerCase())
  ).length / Math.max(analysis.keywords.length, 1)

  // 総合カバー率を計算
  const aspectCoverage = analysis.aspects.length > 0
    ? coveredAspects / analysis.aspects.length
    : 0.5

  const coverage = (aspectCoverage * 0.6 + keywordCoverage * 0.4)

  return { coverage, gaps }
}

/**
 * 重複ソースを除去
 */
function deduplicateSources(sources: SourceInfo[]): SourceInfo[] {
  const seen = new Set<string>()
  return sources.filter(source => {
    // URLの正規化
    const normalizedUrl = source.url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .replace(/^www\./, '')

    if (seen.has(normalizedUrl)) {
      return false
    }
    seen.add(normalizedUrl)
    return true
  })
}

/**
 * 多階層検索を実行
 */
export async function multiLayerSearch(
  query: string,
  options: MultiLayerSearchOptions = {}
): Promise<MultiLayerSearchResult> {
  const {
    maxLayers = 2,
    minCoverage = 0.7,
    numResultsPerLayer = 4,
    braveApiKey,
  } = options

  const layers: LayerResult[] = []
  let allSources: SourceInfo[] = []
  let allNews: NewsInfo[] = []
  let imageResults: Array<{
    url: string
    title: string
    thumbnail?: string
    source?: string
    width?: number
    height?: number
  }> = []
  let totalSearches = 0

  // クエリ分析
  const analysis = analyzeQuerySimple(query)
  console.log('[MultiLayerSearch] Query analysis:', analysis)

  // 実際の検索深度を決定
  const targetDepth = Math.min(analysis.suggestedDepth, maxLayers)
  console.log('[MultiLayerSearch] Target depth:', targetDepth)

  // 第1階層: 初期検索
  console.log('[MultiLayerSearch] Layer 1: Initial search')
  const layer1Result = await integratedSearch(query, {
    numResults: numResultsPerLayer + 2,  // 最初は多めに
    includeNews: true,
    includeImages: true,
    scrapeContent: true,
    braveApiKey,
  })
  totalSearches++

  // 結果を変換
  const layer1Sources: SourceInfo[] = layer1Result.web.map(item => ({
    url: item.url,
    title: item.title,
    description: item.description,
    content: item.content,
    markdown: item.markdown,
    favicon: item.favicon,
    image: item.image,
    siteName: item.siteName,
    layer: 1
  }))

  const layer1News: NewsInfo[] = layer1Result.news.map(item => ({
    url: item.url,
    title: item.title,
    description: item.description,
    publishedDate: item.date,
    source: item.source,
    image: item.imageUrl,
    layer: 1
  }))

  imageResults = layer1Result.images.map(item => ({
    url: item.url,
    title: item.title,
    thumbnail: item.imageUrl,
    source: item.source,
    width: item.width,
    height: item.height,
  }))

  allSources = [...layer1Sources]
  allNews = [...layer1News]

  // カバー率評価
  const { coverage: layer1Coverage, gaps: layer1Gaps } = evaluateCoverageSimple(
    query, layer1Sources, analysis
  )

  layers.push({
    layer: 1,
    query: query,
    sources: layer1Sources,
    newsResults: layer1News,
    coverage: layer1Coverage,
    gaps: layer1Gaps
  })

  console.log('[MultiLayerSearch] Layer 1 coverage:', layer1Coverage, 'gaps:', layer1Gaps)

  // 第2階層以降: 必要に応じて追加検索
  let currentCoverage = layer1Coverage

  for (let layerNum = 2; layerNum <= targetDepth; layerNum++) {
    // カバー率が十分なら終了
    if (currentCoverage >= minCoverage) {
      console.log('[MultiLayerSearch] Coverage sufficient, stopping at layer', layerNum - 1)
      break
    }

    // サブクエリを生成
    const subQueries = generateSubQueries(query, analysis, allSources, layerNum - 1)

    if (subQueries.length === 0) {
      console.log('[MultiLayerSearch] No sub-queries generated, stopping')
      break
    }

    console.log(`[MultiLayerSearch] Layer ${layerNum}: Sub-queries:`, subQueries)

    // 各サブクエリで検索
    const layerSources: SourceInfo[] = []
    const layerNews: NewsInfo[] = []

    for (const subQuery of subQueries) {
      try {
        const subResult = await integratedSearch(subQuery, {
          numResults: numResultsPerLayer,
          includeNews: layerNum === 2,  // 第2階層のみニュースを含む
          includeImages: false,
          scrapeContent: true,
          braveApiKey,
        })
        totalSearches++

        // ソースを追加
        for (const item of subResult.web) {
          layerSources.push({
            url: item.url,
            title: item.title,
            description: item.description,
            content: item.content,
            markdown: item.markdown,
            favicon: item.favicon,
            image: item.image,
            siteName: item.siteName,
            layer: layerNum
          })
        }

        // ニュースを追加
        for (const item of subResult.news) {
          layerNews.push({
            url: item.url,
            title: item.title,
            description: item.description,
            publishedDate: item.date,
            source: item.source,
            image: item.imageUrl,
            layer: layerNum
          })
        }
      } catch (error) {
        console.warn(`[MultiLayerSearch] Sub-query failed: ${subQuery}`, error)
      }
    }

    // 重複を除去して追加
    const newSources = deduplicateSources([...allSources, ...layerSources])
    const addedSources = newSources.slice(allSources.length)

    allSources = newSources
    allNews = [...allNews, ...layerNews]

    // カバー率を再評価
    const { coverage, gaps } = evaluateCoverageSimple(query, allSources, analysis)
    currentCoverage = coverage

    layers.push({
      layer: layerNum,
      query: subQueries.join(' | '),
      sources: addedSources,
      newsResults: layerNews,
      coverage,
      gaps
    })

    console.log(`[MultiLayerSearch] Layer ${layerNum} coverage:`, coverage, 'gaps:', gaps)
  }

  return {
    layers,
    allSources,
    allNews,
    imageResults,
    totalSearches,
    finalCoverage: currentCoverage
  }
}

/**
 * LLMを使った高度なクエリ分析
 */
export async function analyzeQueryWithLLM(
  query: string,
  generateFn: (prompt: string) => Promise<string>
): Promise<QueryAnalysis> {
  const prompt = `以下のクエリを分析してください。JSON形式で回答してください。

クエリ: "${query}"

以下の形式で回答:
{
  "intent": "factual" | "comparison" | "howto" | "opinion" | "current_events" | "technical" | "comprehensive",
  "complexity": "simple" | "medium" | "complex",
  "suggestedDepth": 1 | 2 | 3,
  "aspects": ["このクエリが求めている情報の側面"],
  "keywords": ["重要なキーワード"]
}

JSONのみを返してください。`

  try {
    const response = await generateFn(prompt)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (error) {
    console.warn('[analyzeQueryWithLLM] Failed, falling back to simple analysis:', error)
  }

  return analyzeQuerySimple(query)
}

/**
 * LLMを使った高度なギャップ分析とサブクエリ生成
 */
export async function evaluateCoverageWithLLM(
  query: string,
  sources: SourceInfo[],
  analysis: QueryAnalysis,
  generateFn: (prompt: string) => Promise<string>
): Promise<{ coverage: number; gaps: string[]; subQueries: string[] }> {
  const sourcesSummary = sources.slice(0, 6).map((s, i) =>
    `[${i+1}] ${s.title}: ${(s.description || s.content || '').substring(0, 200)}`
  ).join('\n')

  const prompt = `クエリに対する検索結果の充足度を評価し、不足している情報を特定してください。

クエリ: "${query}"
クエリの意図: ${analysis.intent}
求められる側面: ${analysis.aspects.join(', ')}

現在の検索結果:
${sourcesSummary}

以下の形式でJSON回答してください:
{
  "coverage": 0.0〜1.0の数値（情報の充足度）,
  "gaps": ["不足している情報1", "不足している情報2"],
  "subQueries": ["追加で検索すべきクエリ1", "追加で検索すべきクエリ2"]
}

JSONのみを返してください。`

  try {
    const response = await generateFn(prompt)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (error) {
    console.warn('[evaluateCoverageWithLLM] Failed, falling back to simple evaluation:', error)
  }

  // フォールバック
  const simple = evaluateCoverageSimple(query, sources, analysis)
  return {
    ...simple,
    subQueries: generateSubQueries(query, analysis, sources, 1)
  }
}
