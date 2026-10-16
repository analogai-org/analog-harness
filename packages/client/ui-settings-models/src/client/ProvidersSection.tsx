import { useEffect, useState } from 'react'
import { Button, IconPlusOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelsSectionInjected, ProviderIdentity } from './ModelsSection.tsx'
import { removeProviderProfile } from './ModelsSection.tsx'
import { protocolChoices } from './store.ts'
import type { ProviderRow } from './store.ts'
import { ProviderEditor } from './ProviderEditor.tsx'
import { CustomProviderCard } from './CustomProviderCard.tsx'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

export type ProvidersSectionProps = Partial<InjectFace<ModelsSectionInjected>> & PropsRenderSlots<'settings.models.footer'>

interface EditorTarget extends ProviderIdentity {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: readonly string[]
  credentialRef?: string
  declared?: boolean
}

export function ProvidersSection(props: ProvidersSectionProps) {
  const { controller, operations, schema, t = (k: keyof typeof en | string, p?: Record<string, string>) => {
    let res = String(k)
    if (p) {
      Object.entries(p).forEach(([key, val]) => {
        res = res.replace(`{${key}}`, val)
      })
    }
    return res
  } } = props

  const [snapshot, setSnapshot] = useState(() => controller?.store.getSnapshot())
  useEffect(() => {
    if (!controller) return
    if (controller.store.getSnapshot().status === 'idle') {
      void controller.load()
    }
    return controller.store.subscribe(() => setSnapshot(controller.store.getSnapshot()))
  }, [controller])

  const [editingTarget, setEditingTarget] = useState<EditorTarget | undefined>(undefined)
  const [addingOpen, setAddingOpen] = useState(false)
  const [selectedCatalogRoute, setSelectedCatalogRoute] = useState<string>('')
  const [deletingTarget, setDeletingTarget] = useState<EditorTarget | undefined>(undefined)
  const [deletingError, setDeletingError] = useState<string | undefined>(undefined)
  const [deletingBusy, setDeletingBusy] = useState(false)

  if (!controller || !operations || !schema) {
    return null
  }

  if (!snapshot || snapshot.status === 'idle' || snapshot.status === 'loading') {
    return <div className={styles.section}><p className={styles.intro}>Loading providers…</p></div>
  }

  if (snapshot.status === 'error') {
    return (
      <div className={styles.section}>
        <div role="alert" className={styles.diagnosticBanner}>{snapshot.error}</div>
        <Button onClick={() => void controller.load()}>{t('retry')}</Button>
      </div>
    )
  }

  const { rows, writable, namespaces } = snapshot
  const readOnly = !writable

  const configuredRows = rows.filter((r: ProviderRow) => r.entry.provider !== 'deepseek-account')

  const getRowBaseUrl = (row: ProviderRow): string | undefined => {
    const ns = namespaces.get(row.entry.settingsNs)
    if (!ns) return undefined
    const prof = schema.getPath(ns.value, row.entry.settingsPath) as { baseURL?: unknown } | undefined
    return typeof prof?.baseURL === 'string' && prof.baseURL ? prof.baseURL : undefined
  }

  const handleEdit = (row: ProviderRow) => {
    const target: EditorTarget = {
      provider: row.entry.provider,
      displayName: row.entry.displayName,
      settingsNs: row.entry.settingsNs,
      settingsPath: row.entry.settingsPath,
      ...(row.apiKeyEnv ? { credentialRef: row.apiKeyEnv } : {}),
      ...(row.entry.declared !== undefined ? { declared: row.entry.declared } : {}),
    }
    setEditingTarget(target)
  }

  const handleDeletePrompt = (row: ProviderRow) => {
    setDeletingTarget({
      provider: row.entry.provider,
      displayName: row.entry.displayName,
      settingsNs: row.entry.settingsNs,
      settingsPath: row.entry.settingsPath,
      ...(row.apiKeyEnv ? { credentialRef: row.apiKeyEnv } : {}),
      ...(row.entry.declared !== undefined ? { declared: row.entry.declared } : {}),
    })
    setDeletingError(undefined)
  }

  const handleConfirmDelete = async () => {
    if (!deletingTarget) return
    setDeletingBusy(true)
    setDeletingError(undefined)
    try {
      const err = await removeProviderProfile(operations, controller, deletingTarget)
      if (err) {
        setDeletingError(err)
      } else {
        setDeletingTarget(undefined)
      }
    } finally {
      setDeletingBusy(false)
    }
  }

  const dormantChoices = rows.filter((r: ProviderRow) => !r.configured && r.entry.provider !== 'deepseek-account')
  const selectedDormant = dormantChoices.find((d: ProviderRow) => d.entry.provider === selectedCatalogRoute) ?? dormantChoices[0]
  const protocols = protocolChoices(namespaces.get('llm-pi-ai'), schema)

  const editingNamespace = editingTarget ? namespaces.get(editingTarget.settingsNs) : undefined
  const selectedDormantNamespace = selectedDormant ? namespaces.get(selectedDormant.entry.settingsNs) : undefined

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.title}>{t('providersSectionTitle')}</h2>
          <p className={styles.intro}>{t('providersSectionIntro')}</p>
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            onClick={() => {
              setAddingOpen(true)
              if (dormantChoices.length > 0 && dormantChoices[0]) {
                setSelectedCatalogRoute(dormantChoices[0].entry.provider)
              }
            }}
          >
            <IconPlusOutlineRegular size={14} />
            {t('addProviderBtn')}
          </Button>
        )}
      </div>

      {configuredRows.length === 0 ? (
        <div className={styles.emptyBox}>
          <p>{t('noProvidersConfigured')}</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.customTable}>
            <thead>
              <tr>
                <th>{t('providerName')}</th>
                <th>{t('providerBaseUrl')}</th>
                <th>{t('providerKey')}</th>
                <th style={{ textAlign: 'right' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {configuredRows.map((row: ProviderRow) => {
                const keyConfigured = row.credential?.configured === true
                const baseUrl = getRowBaseUrl(row)
                return (
                  <tr key={row.entry.provider}>
                    <td>
                      <div className={styles.rowIdentity}>
                        <span
                          className={`${styles.credentialDot} ${
                            keyConfigured ? styles.credentialDotConfigured : styles.credentialDotMissing
                          }`}
                          title={keyConfigured ? t('credentialConfigured') : t('credentialMissing')}
                        />
                        <span className={styles.rowName}>{row.entry.displayName}</span>
                        {row.entry.declared && <span className={styles.rowTag}>{t('customTag')}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={styles.codeText}>
                        {baseUrl || t('baseUrlDefault')}
                      </span>
                    </td>
                    <td>
                      {keyConfigured ? (
                        <span className={styles.apiKeyMasked}>••••••••••••</span>
                      ) : (
                        <span className={styles.notice}>{t('credentialMissing')}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className={styles.rowActions}>
                        <Button
                          variant="outline"
                          onClick={() => handleEdit(row)}
                          disabled={readOnly}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => handleDeletePrompt(row)}
                          disabled={readOnly}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingTarget && editingNamespace && (
        <Modal
          open={true}
          onClose={() => setEditingTarget(undefined)}
          closeLabel={t('close')}
          title={t('editProvider', { provider: editingTarget.displayName })}
        >
          <div className={styles.editor}>
            <ProviderEditor
              provider={editingTarget.provider}
              displayName={editingTarget.displayName}
              settingsPath={editingTarget.settingsPath}
              {...(editingTarget.declared !== undefined ? { declared: editingTarget.declared } : {})}
              namespace={editingNamespace}
              schema={schema}
              operations={operations}
              t={t as (key: keyof typeof en) => string}
              readOnly={readOnly}
              onClose={() => setEditingTarget(undefined)}
            />
          </div>
        </Modal>
      )}

      {/* Add Provider Modal */}
      {addingOpen && (
        <Modal
          open={true}
          onClose={() => setAddingOpen(false)}
          closeLabel={t('close')}
          title={t('addProvider')}
        >
          <div className={styles.editor}>
            {dormantChoices.length > 0 && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>{t('provider')}</label>
                <select
                  className={`${styles.input} ${styles.selectInput}`}
                  value={selectedCatalogRoute}
                  onChange={e => setSelectedCatalogRoute(e.target.value)}
                  style={{ maxWidth: '100%' }}
                >
                  {dormantChoices.map((d: ProviderRow) => (
                    <option key={d.entry.provider} value={d.entry.provider}>
                      {d.entry.displayName}
                    </option>
                  ))}
                  <option value="__custom__">{t('addCustom')}</option>
                </select>
              </div>
            )}

            {selectedCatalogRoute === '__custom__' || dormantChoices.length === 0 ? (
              <CustomProviderCard
                protocols={protocols}
                taken={rows.map((r: ProviderRow) => r.entry.provider)}
                revision={namespaces.get('llm-pi-ai')?.revision ?? 0}
                operations={operations}
                t={t as (key: keyof typeof en) => string}
                readOnly={readOnly}
                onClose={() => setAddingOpen(false)}
              />
            ) : selectedDormant && selectedDormantNamespace ? (
              <ProviderEditor
                provider={selectedDormant.entry.provider}
                displayName={selectedDormant.entry.displayName}
                settingsPath={selectedDormant.entry.settingsPath}
                namespace={selectedDormantNamespace}
                schema={schema}
                operations={operations}
                t={t as (key: keyof typeof en) => string}
                readOnly={readOnly}
                onClose={() => setAddingOpen(false)}
              />
            ) : null}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTarget && (
        <Modal
          open={true}
          onClose={() => setDeletingTarget(undefined)}
          closeLabel={t('close')}
          title={t('deleteTitle', { provider: deletingTarget.displayName })}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p className={styles.intro}>
              {deletingTarget.credentialRef !== undefined
                ? t('deleteDescriptionWithCredential', { provider: deletingTarget.displayName })
                : t('deleteDescription', { provider: deletingTarget.displayName })}
            </p>
            {deletingError && <p className={styles.error}>{deletingError}</p>}
            <div className={styles.editorActions}>
              <Button variant="outline" onClick={() => setDeletingTarget(undefined)} disabled={deletingBusy}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDelete}
                disabled={deletingBusy}
              >
                {deletingBusy ? t('deleting', { provider: deletingTarget.displayName }) : t('deleteConfirm', { provider: deletingTarget.displayName })}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
