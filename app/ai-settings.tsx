'use client'

import { useState } from 'react'
import { Settings, ChevronDown, ChevronUp } from 'lucide-react'

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'
export type TextVerbosity = 'terse' | 'medium' | 'verbose'

export interface AISettings {
  model: string
  reasoningEffort: ReasoningEffort
  textVerbosity: TextVerbosity
}

// モデルごとの設定
export interface ModelConfig {
  value: string
  label: string
  description: string
  supportsReasoning: boolean
  reasoningOptions?: ReasoningEffort[]
}

export const AI_MODELS: ModelConfig[] = [
  {
    value: 'gpt-5.2',
    label: 'GPT-5.2',
    description: '最新・高性能',
    supportsReasoning: true,
    reasoningOptions: ['none', 'low', 'medium', 'high', 'xhigh']
  },
  {
    value: 'gpt-5.2-pro',
    label: 'GPT-5.2 Pro',
    description: '最高性能',
    supportsReasoning: true,
    reasoningOptions: ['medium', 'high', 'xhigh']
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    description: '高速・軽量',
    supportsReasoning: false
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    description: '超高速',
    supportsReasoning: false
  },
]

// モデルの設定を取得するヘルパー関数
export function getModelConfig(modelValue: string): ModelConfig | undefined {
  return AI_MODELS.find(m => m.value === modelValue)
}

interface AISettingsProps {
  settings: AISettings
  onSettingsChange: (settings: AISettings) => void
}

// 推論の深さのラベル定義
const REASONING_LABELS: Record<ReasoningEffort, { label: string; description: string }> = {
  none: { label: 'なし', description: '推論なし・最速' },
  low: { label: '軽量', description: '高速・低コスト' },
  medium: { label: '標準', description: 'バランス' },
  high: { label: '深い', description: '高精度' },
  xhigh: { label: '最深', description: '最高精度' },
}

export function AISettingsPanel({ settings, onSettingsChange }: AISettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const currentModelConfig = getModelConfig(settings.model)

  // モデル変更時に推論設定を調整
  const handleModelChange = (modelValue: string) => {
    const newModelConfig = getModelConfig(modelValue)
    let newReasoningEffort = settings.reasoningEffort

    if (!newModelConfig?.supportsReasoning) {
      // 推論をサポートしないモデルの場合、デフォルト値を設定（APIには送らない）
      newReasoningEffort = 'medium'
    } else if (newModelConfig.reasoningOptions && !newModelConfig.reasoningOptions.includes(settings.reasoningEffort)) {
      // 現在の設定が新しいモデルでサポートされていない場合、デフォルトに調整
      newReasoningEffort = newModelConfig.reasoningOptions.includes('medium') ? 'medium' : newModelConfig.reasoningOptions[0]
    }

    onSettingsChange({ ...settings, model: modelValue, reasoningEffort: newReasoningEffort })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 rounded-lg transition-colors"
        title="AI設定"
      >
        <Settings className="w-4 h-4" />
        <span className="hidden sm:inline">AI設定</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 z-50 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            AI設定
          </h3>

          {/* Model Selection */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              AIモデル
            </label>
            <div className="grid grid-cols-2 gap-1">
              {AI_MODELS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => handleModelChange(model.value)}
                  className={`px-2 py-2 text-xs rounded-lg transition-colors ${
                    settings.model === model.value
                      ? 'bg-[#ff4d00] text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                  title={model.description}
                >
                  {model.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
              {currentModelConfig?.description || ''}
            </p>
          </div>

          {/* Reasoning Effort - 対応モデルのみ表示 */}
          {currentModelConfig?.supportsReasoning && currentModelConfig.reasoningOptions && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                推論の深さ
              </label>
              <div className="flex gap-1 flex-wrap">
                {currentModelConfig.reasoningOptions.map((effort) => (
                  <button
                    key={effort}
                    onClick={() => onSettingsChange({ ...settings, reasoningEffort: effort })}
                    className={`flex-1 min-w-[3rem] px-2 py-2 text-xs rounded-lg transition-colors ${
                      settings.reasoningEffort === effort
                        ? 'bg-[#ff4d00] text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                    title={REASONING_LABELS[effort].description}
                  >
                    {REASONING_LABELS[effort].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                {REASONING_LABELS[settings.reasoningEffort]?.description || ''}
              </p>
            </div>
          )}

          {/* 推論非対応モデルの場合のメッセージ */}
          {currentModelConfig && !currentModelConfig.supportsReasoning && (
            <div className="mb-4">
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                このモデルは推論設定に対応していません
              </p>
            </div>
          )}

          {/* Text Verbosity */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              回答の詳しさ
            </label>
            <div className="flex gap-1">
              {[
                { value: 'terse', label: '簡潔', description: '要点のみ' },
                { value: 'medium', label: '標準', description: 'バランス' },
                { value: 'verbose', label: '詳細', description: '詳しく説明' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSettingsChange({ ...settings, textVerbosity: option.value as AISettings['textVerbosity'] })}
                  className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
                    settings.textVerbosity === option.value
                      ? 'bg-[#ff4d00] text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
              {settings.textVerbosity === 'terse' && '要点を簡潔に回答'}
              {settings.textVerbosity === 'medium' && '適度な詳しさで回答'}
              {settings.textVerbosity === 'verbose' && '詳細な説明付きで回答'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
