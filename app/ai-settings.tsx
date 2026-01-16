'use client'

import { useState } from 'react'
import { Settings, ChevronDown, ChevronUp } from 'lucide-react'

export interface AISettings {
  reasoningEffort: 'minimal' | 'medium' | 'high'
  textVerbosity: 'terse' | 'medium' | 'verbose'
}

interface AISettingsProps {
  settings: AISettings
  onSettingsChange: (settings: AISettings) => void
}

export function AISettingsPanel({ settings, onSettingsChange }: AISettingsProps) {
  const [isOpen, setIsOpen] = useState(false)

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
            AI設定 (GPT-5.2)
          </h3>

          {/* Reasoning Effort */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              推論の深さ
            </label>
            <div className="flex gap-1">
              {[
                { value: 'minimal', label: '軽量', description: '高速・低コスト' },
                { value: 'medium', label: '標準', description: 'バランス' },
                { value: 'high', label: '深い', description: '高精度' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSettingsChange({ ...settings, reasoningEffort: option.value as AISettings['reasoningEffort'] })}
                  className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
                    settings.reasoningEffort === option.value
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
              {settings.reasoningEffort === 'minimal' && '高速レスポンス、簡単な質問向け'}
              {settings.reasoningEffort === 'medium' && 'バランスの取れた推論'}
              {settings.reasoningEffort === 'high' && '複雑な問題に深く考える'}
            </p>
          </div>

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
