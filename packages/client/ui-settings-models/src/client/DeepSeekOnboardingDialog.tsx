/**
 * Official-DeepSeek first-run step. Readiness comes from the same
 * provider/settings/credential join as the Models page: any provider the user
 * can already talk to ends the step, and only a user with none is offered the
 * official DeepSeek route. The step reuses that page's credential editor in
 * the onboarding plugin's shared modal, so the key is entered once.
 */
import type { TrackProductEvent } from '@deepseek-ai/dsh-client-product-analytics/client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelsSettingsState, ModelsSettingsStore } from './store.ts'
import { onboardingReadiness } from './store.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import { ProviderEditor } from './ProviderEditor.tsx'
import type {} from './slot-contract.ts'
import type { en } from './locales.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
import styles from './DeepSeekOnboardingDialog.module.css'

/** Registration-side dependencies of {@link DeepSeekOnboardingDialog}. */
export interface DeepSeekOnboardingInjected {
  /** Desktop-only event collection. */
  track?: TrackProductEvent
  /** Whether first-run setup should show automatically. Explicit requests remain available. */
  automatic: boolean
  hooks: {
    /** Shared Models-page join state, bound by the slot renderer. */
    models: SnapshotStore<ModelsSettingsState>
  }
  /** Shared Models-page join controller. */
  controller: ModelsSettingsStore
  /** The Host operations the reused Models credential editor writes through. */
  operations: ModelsOperations
  /** Settings schema and immutable path callbacks. */
  schema: SettingsSchemaOperations
  /** Feature copy. */
  t: (key: keyof typeof en) => string
}

/** Slot owner props plus the feature's injected dependencies. */
export type DeepSeekOnboardingDialogProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<DeepSeekOnboardingInjected>

/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected DeepSeek onboarding state')
}

/**
 * Prompt a first-run user for a provider credential (OpenAI, Anthropic, or DeepSeek)
 * while no provider can serve requests and that credential is writable.
 * @param props - settings-shell owner state and Models feature dependencies.
 * @returns the onboarding modal or null when onboarding needs no intervention.
 */
export function DeepSeekOnboardingDialog(props: DeepSeekOnboardingDialogProps): ReactNode {
  const { complete, controller, useModels, operations, schema, t, automatic, explicit = false } = props
  const state = useModels(snapshot => snapshot)
  const readiness = onboardingReadiness(state)
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')

  useEffect(() => {
    if ((automatic || explicit) && state.status === 'idle') void controller.load()
  }, [controller, state.status, automatic, explicit])

  useEffect(() => {
    if (
      (!automatic && !explicit)
      || readiness.kind === 'adapter-absent'
      || (!explicit && readiness.kind === 'provider-ready')
      || readiness.kind === 'unavailable'
    ) complete()
  }, [complete, readiness.kind, explicit, automatic])

  if (!automatic && !explicit) return null

  switch (readiness.kind) {
    case 'loading':
    case 'adapter-absent':
    case 'unavailable':
      return null
    case 'provider-ready':
      if (!explicit) return null
      break
    case 'credential-missing':
      break
    /* v8 ignore next -- every current readiness variant is handled above */
    default:
      return assertNever(readiness)
  }

  const row = state.rows.find(candidate => candidate.entry.provider === selectedProvider)
    ?? state.rows.find(candidate => candidate.entry.provider === 'openai')
    ?? state.rows.find(candidate => candidate.entry.provider === 'anthropic')
    ?? state.rows.find(candidate => candidate.entry.provider === 'deepseek-official')
    ?? state.rows[0]

  const namespace = row ? state.namespaces.get(row.entry.settingsNs) : undefined
  if (row === undefined || namespace === undefined) return null

  const finishCredential = (changed: boolean): void => {
    if (!changed) {
      complete()
      return
    }
    void controller.load()
  }

  const editor = (
    <OnboardingModal title={t('onboardingTitle')}>
      <p className={styles.description}>
        Select your AI model provider to sign in with OAuth or configure an API key.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--dsw-radius-m)',
            border: (row.entry.provider === 'openai')
              ? '2px solid var(--dsw-alias-brand-primary)'
              : '0.5px solid var(--dsw-alias-border-l2)',
            background: (row.entry.provider === 'openai')
              ? 'var(--dsw-alias-brand-secondary, rgba(0, 120, 212, 0.08))'
              : 'var(--dsw-alias-settings-card-fill)',
            color: 'var(--dsw-alias-label-primary)',
            fontWeight: (row.entry.provider === 'openai') ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: 13,
          }}
          onClick={() => setSelectedProvider('openai')}
        >
          OpenAI
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--dsw-radius-m)',
            border: (row.entry.provider === 'anthropic')
              ? '2px solid var(--dsw-alias-brand-primary)'
              : '0.5px solid var(--dsw-alias-border-l2)',
            background: (row.entry.provider === 'anthropic')
              ? 'var(--dsw-alias-brand-secondary, rgba(0, 120, 212, 0.08))'
              : 'var(--dsw-alias-settings-card-fill)',
            color: 'var(--dsw-alias-label-primary)',
            fontWeight: (row.entry.provider === 'anthropic') ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: 13,
          }}
          onClick={() => setSelectedProvider('anthropic')}
        >
          Anthropic
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--dsw-radius-m)',
            border: (row.entry.provider === 'deepseek-official')
              ? '2px solid var(--dsw-alias-brand-primary)'
              : '0.5px solid var(--dsw-alias-border-l2)',
            background: (row.entry.provider === 'deepseek-official')
              ? 'var(--dsw-alias-brand-secondary, rgba(0, 120, 212, 0.08))'
              : 'var(--dsw-alias-settings-card-fill)',
            color: 'var(--dsw-alias-label-primary)',
            fontWeight: (row.entry.provider === 'deepseek-official') ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: 13,
          }}
          onClick={() => setSelectedProvider('deepseek-official')}
        >
          DeepSeek
        </button>
      </div>

      <div className={styles.editor}>
        <ProviderEditor
          key={row.entry.provider}
          provider={row.entry.provider}
          displayName={row.entry.displayName}
          namespace={namespace}
          schema={schema}
          settingsPath={row.entry.settingsPath}
          operations={operations}
          t={t}
          readOnly={false}
          hideTitle
          credentialOnly
          onSubmitCredential={() => { props.track?.('api_key_save_click', {}) }}
          credentialRequired={row.entry.provider === 'deepseek-official'}
          autoFocusCredential
          cancelLabelKey="onboardingLater"
          submitLabelKey="onboardingSave"
          submitBusyLabelKey="onboardingSaving"
          onClose={finishCredential}
        />
      </div>
    </OnboardingModal>
  )
  return editor
}
