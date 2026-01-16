export const ErrorMessages = {
  401: {
    title: "認証が必要です",
    message: "APIキーが無効か、正しく設定されていません。",
    action: "APIキーを確認する",
    actionUrl: "https://platform.openai.com/api-keys"
  },
  402: {
    title: "クレジット不足",
    message: "APIクレジットが不足しています。",
    action: "プランをアップグレード",
    actionUrl: "https://platform.openai.com/settings/organization/billing"
  },
  429: {
    title: "レート制限",
    message: "リクエストが多すぎます。しばらく待ってから再試行してください。",
    action: "レート制限について",
    actionUrl: "https://platform.openai.com/docs/guides/rate-limits"
  },
  500: {
    title: "エラーが発生しました",
    message: "予期しないエラーが発生しました。再試行してください。",
    action: "サポートに連絡",
    actionUrl: "https://help.openai.com"
  },
  504: {
    title: "タイムアウト",
    message: "リクエストに時間がかかりすぎました。より簡単なクエリを試してください。",
    action: "ベストプラクティス",
    actionUrl: "https://platform.openai.com/docs/guides/production-best-practices"
  }
} as const

export function getErrorMessage(statusCode: number): typeof ErrorMessages[keyof typeof ErrorMessages] {
  return ErrorMessages[statusCode as keyof typeof ErrorMessages] || ErrorMessages[500]
}
