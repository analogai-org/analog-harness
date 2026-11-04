/** Provider catalogue suggestions beside an independently editable model ID. */

import { useEffect, useId, useState, type ReactNode } from 'react'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'

interface ProviderModel {
  id: string
  name?: string
}

const FALLBACK_PROVIDER_MODELS: Record<string, ProviderModel[]> = {
  openai: [
    { id: 'o3-mini' },
    { id: 'o1' },
    { id: 'o1-mini' },
    { id: 'gpt-4o' },
    { id: 'gpt-4o-mini' },
    { id: 'gpt-4-turbo' },
    { id: 'gpt-3.5-turbo' },
  ],
  openai_oauth: [
    { id: 'gpt-6-astra' },
    { id: 'gpt-6.1-sol' },
    { id: 'gpt-6-sol' },
    { id: 'gpt-6.1-terra' },
    { id: 'gpt-6-luna' },
    { id: 'gpt-5.6-sol' },
    { id: 'gpt-5.6-terra' },
    { id: 'gpt-5.6-luna' },
    { id: 'gpt-5.3-codex' },
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219' },
    { id: 'claude-3-5-sonnet-20241022' },
    { id: 'claude-3-5-haiku-20241022' },
    { id: 'claude-3-opus-20240229' },
  ],
  anthropic_oauth: [
    { id: 'claude-opus-5-5' },
    { id: 'claude-sonnet-5-5' },
    { id: 'claude-haiku-5-5' },
    { id: 'claude-fable-5-1' },
    { id: 'claude-opus-5' },
    { id: 'claude-sonnet-5' },
    { id: 'claude-fable-5' },
    { id: 'claude-opus-4-8' },
    { id: 'claude-opus-4-7' },
    { id: 'claude-sonnet-4-6' },
    { id: 'claude-opus-4-6' },
    { id: 'claude-opus-4-5' },
    { id: 'claude-sonnet-4-5' },
    { id: 'claude-haiku-4-5' },
  ],
  deepseek: [
    { id: 'deepseek-reasoner' },
    { id: 'deepseek-chat' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash-thinking-exp' },
    { id: 'gemini-2.0-flash' },
    { id: 'gemini-2.0-pro-exp-02-05' },
    { id: 'gemini-1.5-pro' },
    { id: 'gemini-1.5-flash' },
  ],
  grok: [
    { id: 'grok-2-mini' },
    { id: 'grok-2-1212' },
    { id: 'grok-beta' },
  ],
  xai: [
    { id: 'grok-2-mini' },
    { id: 'grok-2-1212' },
  ],
  ollama: [
    { id: 'deepseek-r1:14b' },
    { id: 'deepseek-r1:8b' },
    { id: 'deepseek-r1:70b' },
    { id: 'qwen2.5-coder:7b' },
    { id: 'qwen2.5-coder:14b' },
    { id: 'llama3.3:70b' },
    { id: 'llama3.1:8b' },
  ],
  mistral: [
    { id: 'mistral-large-latest' },
    { id: 'mistral-small-latest' },
    { id: 'codestral-latest' },
    { id: 'ministral-8b-latest' },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-r1' },
    { id: 'deepseek/deepseek-chat' },
    { id: 'anthropic/claude-3.7-sonnet' },
    { id: 'openai/o3-mini' },
    { id: 'meta-llama/llama-3.3-70b-instruct' },
    { id: 'google/gemini-2.0-flash-001' },
  ],
  together: [
    { id: 'deepseek-ai/DeepSeek-R1' },
    { id: 'deepseek-ai/DeepSeek-V3' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
    { id: 'Qwen/Qwen2.5-Coder-32B-Instruct' },
  ],
  cerebras: [
    { id: 'llama3.3-70b' },
    { id: 'llama3.1-8b' },
    { id: 'deepseek-r1-distill-llama-70b' },
  ],
  vllm: [
    { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B' },
    { id: 'Qwen/Qwen2.5-Coder-7B-Instruct' },
  ],
}

interface ProviderModelPickerProps {
  providerId: string
  value: string
  onChange: (value: string) => void
  t: (key: ModelsKey) => string
  loadModels?: (providerId: string, signal: AbortSignal) => Promise<ProviderModel[]>
}

type CatalogueState = { providerId: string } & (
  | { kind: 'loading' }
  | { kind: 'ready'; models: ProviderModel[] }
  | { kind: 'error' }
)

/**
 * Copy a catalogue choice into the model ID while preserving arbitrary typed IDs.
 * @param props - controlled model ID, provider catalogue loader, and section copy.
 * @returns labelled model ID and catalogue controls with local query feedback.
 */
export function ProviderModelPicker({ providerId, value, onChange, t, loadModels }: ProviderModelPickerProps): ReactNode {
  const statusId = useId()
  const fallbackModels = FALLBACK_PROVIDER_MODELS[providerId.toLowerCase()] ?? []
  const [catalogue, setCatalogue] = useState<CatalogueState>({ providerId: '', kind: 'ready', models: fallbackModels })

  useEffect(() => {
    const loader = loadModels
    const fallback = FALLBACK_PROVIDER_MODELS[providerId.toLowerCase()] ?? []
    if (!providerId || !loader) {
      setCatalogue({ providerId, kind: 'ready', models: fallback })
      return
    }
    const controller = new AbortController()
    setCatalogue({ providerId, kind: 'loading' })
    const load = async (): Promise<void> => {
      try {
        const fetched = await loader(providerId, controller.signal)
        const merged = fetched.length > 0 ? fetched : fallback
        if (!controller.signal.aborted) setCatalogue({ providerId, kind: 'ready', models: merged })
      } catch {
        if (!controller.signal.aborted) setCatalogue({ providerId, kind: fallback.length > 0 ? 'ready' : 'error', models: fallback })
      }
    }
    void load()
    return () => { controller.abort() }
  }, [providerId, loadModels])

  const current = catalogue.providerId === providerId ? catalogue : undefined
  const models = current && 'models' in current && current.models.length > 0
    ? current.models
    : fallbackModels
  const loading = current?.kind === 'loading'
  const message = current?.kind === 'error' && models.length === 0
    ? t('providerModelCatalogFailed')
    : !loading && models.length === 0 ? t('providerModelCatalogEmpty') : ''
  const selected = models.some(model => model.id === value) ? value : ''

  return <div>
    <div className={styles['providerModelPicker']}>
      <label className={styles['formGroup']}>
        <span className={styles['formLabel']}>{t('providerModelCatalog')}</span>
        <select
          className={`${styles['formSelect']} ${styles['selectInput']}`}
          value={selected}
          disabled={loading && models.length === 0}
          onChange={(event) => { if (event.target.value) onChange(event.target.value) }}
          aria-busy={loading}
          aria-describedby={statusId}
        >
          <option value="">{t(loading ? 'providerModelCatalogLoading' : 'providerModelCatalogChoose')}</option>
          {models.map(model => <option key={model.id} value={model.id}>
            {model.name || model.id}
          </option>)}
        </select>
      </label>
      <label className={styles['formGroup']}>
        <span className={styles['formLabel']}>{t('modelId')}</span>
        <input
          className={styles['formInput']}
          value={value}
          onChange={(event) => { onChange(event.target.value) }}
          aria-describedby={statusId}
        />
      </label>
    </div>
    <p id={statusId} className={styles['providerModelCatalogStatus']} role="status">{message}</p>
  </div>
}
