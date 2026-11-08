/** Provider catalogue suggestions beside an independently editable model ID. */

import { useEffect, useId, useState, type ReactNode } from 'react'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'

interface ProviderModel {
  id: string
  name?: string
}

interface ProviderModelPickerProps {
  providerId: string
  provider?: { id: string; provider_type?: string; name?: string; display_name?: string; auth_type?: string; api_key?: string } | undefined
  value: string
  onChange: (value: string) => void
  t: (key: ModelsKey) => string
  loadModels?: ((providerId: string, signal: AbortSignal) => Promise<ProviderModel[]>) | undefined
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
  const [catalogue, setCatalogue] = useState<CatalogueState>({ providerId: '', kind: 'ready', models: [] })

  useEffect(() => {
    const loader = loadModels
    if (!providerId || !loader) {
      setCatalogue({ providerId, kind: 'ready', models: [] })
      return
    }
    const controller = new AbortController()
    setCatalogue({ providerId, kind: 'loading' })
    const load = async (): Promise<void> => {
      try {
        const fetched = await loader(providerId, controller.signal)
        if (!controller.signal.aborted) setCatalogue({ providerId, kind: 'ready', models: fetched })
      } catch {
        if (!controller.signal.aborted) setCatalogue({ providerId, kind: 'error' })
      }
    }
    void load()
    return () => { controller.abort() }
  }, [providerId, loadModels])

  const current = catalogue.providerId === providerId ? catalogue : undefined
  const models = current && 'models' in current ? current.models : []
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
            {model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id}
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
