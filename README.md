# AI検索エンジン

AIによる検索と回答生成。ウェブ、ニュース、画像を統合した検索エンジン。

<img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjBxbWFxamZycWRkMmVhMGFiZnNuZjMxc3lpNHpuamR4OWlwa3F4NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QbfaTCB1OmkRmIQwzJ/giphy.gif" width="100%" alt="AI検索エンジン Demo" />

## 特徴

- 🔍 **Brave Search API** - 高速で信頼性の高い検索（無料枠あり）
- 🌐 **ウェブスクレイピング** - 検索結果を自動的にスクレイピング
- 🤖 **GPT-5.2対応** - OpenAI最新モデルで回答を生成
- ⚙️ **AI設定UI** - モデル・推論の深さ・回答の詳しさを調整可能
- 🇯🇵 **日本語UI** - 完全日本語対応
- 📰 **ニュース検索** - 最新ニュースを検索
- 🖼️ **画像検索** - 関連画像を表示

## ワンクリックデプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DaisukeHori/fireplexity&env=OPENAI_API_KEY,BRAVE_API_KEY&envDescription=API%E3%82%AD%E3%83%BC%E3%82%92%E5%85%A5%E5%8A%9B%E3%81%97%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84&envLink=https://github.com/DaisukeHori/fireplexity%23api%E3%82%AD%E3%83%BC%E3%81%AE%E5%8F%96%E5%BE%97)

## セットアップ

```bash
git clone https://github.com/DaisukeHori/fireplexity.git
cd fireplexity
pnpm install
```

## 環境変数

```bash
cp .env.example .env.local
```

`.env.local` を編集:

```env
# OpenAI API（必須）
OPENAI_API_KEY=sk-your-openai-api-key

# Brave Search API（推奨）
# 設定しないとDuckDuckGoを使用（サーバー環境ではブロックされる場合あり）
BRAVE_API_KEY=your-brave-api-key

# Groq API（OpenAIの代替）
# GROQ_API_KEY=gsk_your-groq-api-key

# OpenAI設定（オプション）
# OPENAI_API_BASE_URL=https://api.openai.com/v1
# OPENAI_MODEL=gpt-5.2
```

## 実行

```bash
pnpm dev
```

http://localhost:3000 を開く

## APIキーの取得

| API | 取得先 | 備考 |
|-----|--------|------|
| **OpenAI** | [platform.openai.com](https://platform.openai.com/api-keys) | 必須（またはGroq） |
| **Brave Search** | [brave.com/search/api](https://brave.com/search/api/) | 推奨・無料枠2,000回/月 |
| **Groq** | [console.groq.com](https://console.groq.com/keys) | OpenAIの代替・無料枠あり |

## AI設定

UIから以下の設定を変更可能:

- **AIモデル**: GPT-5.2, GPT-5.2 Pro, GPT-5 Mini, GPT-5 Nano
- **推論の深さ**: なし〜最深（モデルにより異なる）
- **回答の詳しさ**: 簡潔〜詳細

## 技術スタック

- Next.js 15
- React 19
- Tailwind CSS v4
- AI SDK (Vercel)
- Brave Search API / DuckDuckGo（フォールバック）
- Cheerio（スクレイピング）

## ライセンス

MIT License
