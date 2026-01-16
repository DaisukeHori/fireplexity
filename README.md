# AI検索エンジン

AIによる検索と回答生成。ウェブ、ニュース、画像を統合した検索エンジン。

<img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjBxbWFxamZycWRkMmVhMGFiZnNuZjMxc3lpNHpuamR4OWlwa3F4NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QbfaTCB1OmkRmIQwzJ/giphy.gif" width="100%" alt="AI検索エンジン Demo" />

## 特徴

- 🔍 **内蔵検索エンジン** - 外部API不要でDuckDuckGo検索を内蔵
- 🌐 **ウェブスクレイピング** - 検索結果を自動的にスクレイピング
- 🤖 **AI回答生成** - OpenAI または Groq で回答を生成
- 🇯🇵 **日本語UI** - 完全日本語対応
- 📰 **ニュース検索** - 最新ニュースを検索
- 🖼️ **画像検索** - 関連画像を表示

## ワンクリックデプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DaisukeHori/fireplexity&env=OPENAI_API_KEY&envDescription=OpenAI%20API%E3%82%AD%E3%83%BC%E3%82%92%E5%85%A5%E5%8A%9B%E3%81%97%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84&envLink=https://platform.openai.com/api-keys)

## セットアップ

```bash
git clone https://github.com/DaisukeHori/fireplexity.git
cd fireplexity
npm install
```

## 設定

```bash
cp .env.example .env.local
```

`.env.local` に以下のキーを追加:

```env
# OpenAI API（推奨）
OPENAI_API_KEY=sk-your-openai-api-key

# または Groq API
GROQ_API_KEY=gsk_your-groq-api-key
```

**注意**: OpenAI または Groq のどちらか一方のAPIキーが必要です。両方設定した場合はOpenAIが優先されます。

## 実行

```bash
npm run dev
```

http://localhost:3000 を開く

## APIキーの取得

- [OpenAI](https://platform.openai.com/api-keys) - 推奨
- [Groq](https://console.groq.com/keys) - 無料枠あり

## 技術スタック

- Next.js 15
- React 19
- Tailwind CSS v4
- AI SDK (Vercel)
- 内蔵検索エンジン（DuckDuckGo）

## ライセンス

MIT License
