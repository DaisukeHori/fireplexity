/**
 * 単一URL用スクレイプAPI
 * 並列実行で高速化するために分離
 */

import { NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/scraper/scrape'

export const maxDuration = 30 // 単一URLなので短めに設定

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url, timeout = 15000, usePuppeteer = true } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    console.log(`[Scrape API] Processing: ${url}`)

    const result = await scrapeUrl(url, {
      timeout,
      usePuppeteer,
    })

    if (!result) {
      return NextResponse.json({
        url,
        error: 'Failed to scrape',
        fallback: true
      }, { status: 200 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Scrape API] Error:', error)
    return NextResponse.json({
      error: (error as Error).message || 'Unknown error',
      fallback: true
    }, { status: 200 })
  }
}
