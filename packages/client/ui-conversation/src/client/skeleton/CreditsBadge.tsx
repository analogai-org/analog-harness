import { useCallback, useEffect, useState } from 'react'
import { Modal, Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CreditsBadge.module.css'

interface LicenseStatus {
  credits_remaining: number
  credits_total: number
  is_expired: boolean
  machine_id: string
  expires_at?: string | null
}

const DEFAULT_BASE_URL = 'http://localhost:8071'
const CLOUD_REDEEM_URL = 'https://cloud.analogai.net/license'

export function CreditsBadge() {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedMid, setCopiedMid] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${DEFAULT_BASE_URL}/v1/license/status`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {
      // Chat server not yet running or network error, ignore gracefully
    }
  }, [])

  useEffect(() => {
    void fetchStatus()
    const timer = setInterval(() => {
      void fetchStatus()
    }, 15000)
    return () => clearInterval(timer)
  }, [fetchStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    setErrorMsg(null)
    try {
      await fetchStatus()
    } finally {
      setRefreshing(false)
    }
  }

  const handleCopyMachineId = async () => {
    if (!status?.machine_id) return
    try {
      await navigator.clipboard.writeText(status.machine_id)
      setCopiedMid(true)
      setTimeout(() => setCopiedMid(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyInput.trim()) return

    setRedeeming(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await fetch(`${DEFAULT_BASE_URL}/v1/license/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim() }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.detail || data.message || `Redemption failed (${res.status})`)
      }

      setSuccessMsg(`Successfully redeemed! +${data.credits_added ?? ''} credits added.`)
      setKeyInput('')
      await fetchStatus()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setRedeeming(false)
    }
  }

  const creditsRemaining = status?.credits_remaining ?? 0
  const machineId = status?.machine_id || ''
  const cloudUrl = machineId
    ? `${CLOUD_REDEEM_URL}?machine_id=${encodeURIComponent(machineId)}`
    : CLOUD_REDEEM_URL

  return (
    <div className={css.root}>
      <button
        type="button"
        className={css.badge}
        onClick={() => {
          setErrorMsg(null)
          setSuccessMsg(null)
          setModalOpen(true)
          void fetchStatus()
        }}
        title="AnalogAI Local Credits - Click to view or renew"
      >
        <span className={css.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        </span>
        <span className={css.amount}>{creditsRemaining.toLocaleString()}</span>
        <span className={css.label}>Credits</span>
      </button>

      <button
        type="button"
        className={css.redeemBtn}
        onClick={() => {
          setErrorMsg(null)
          setSuccessMsg(null)
          setModalOpen(true)
          void fetchStatus()
        }}
      >
        Request Credits
      </button>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Credits & Licensing"
        closeLabel="Close"
        description="Request additional credits on Analog Cloud or apply an offline license key."
      >
        <div className={css.dialogBody}>
          <div className={css.infoRow}>
            <span className={css.infoLabel}>Available Balance</span>
            <div className={css.balanceGroup}>
              <span className={css.infoValue}>
                {creditsRemaining.toLocaleString()} / {(status?.credits_total ?? 500).toLocaleString()} Credits
              </span>
              <button
                type="button"
                className={css.refreshBtn}
                onClick={() => void handleRefresh()}
                title="Sync balance"
                disabled={refreshing}
              >
                {refreshing ? '...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {machineId && (
            <div className={css.infoRow}>
              <div>
                <div className={css.infoLabel}>Machine Code</div>
                <div className={css.machineIdText}>{machineId}</div>
              </div>
              <button
                type="button"
                className={css.copyBtn}
                onClick={() => void handleCopyMachineId()}
              >
                {copiedMid ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* Primary Action: Request Additional Credits / Payment Portal */}
          <div className={css.primaryOptionCard}>
            <div className={css.optionHeader}>
              <div className={css.optionTitle}>Request Additional Credits</div>
              <div className={css.optionSubtitle}>
                Visit Analog Cloud to request additional credits, top up your account, or manage payments.
              </div>
            </div>
            <a
              href={cloudUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={css.cloudButton}
            >
              <span>Request Additional Credits at cloud.analogai.net</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          {/* Secondary Option: Manual Code / License Input */}
          <div className={css.secondarySection}>
            <button
              type="button"
              className={css.toggleManualBtn}
              onClick={() => setShowManual((prev) => !prev)}
            >
              <span>{showManual ? '▼' : '▶'} Manual License Key Entry (Secondary Option)</span>
            </button>

            {showManual && (
              <form onSubmit={handleRedeem} className={css.manualForm}>
                <div className={css.field}>
                  <label htmlFor="license-key-input" className={css.fieldLabel}>License Key</label>
                  <input
                    id="license-key-input"
                    type="text"
                    className={css.input}
                    placeholder="e.g. ANALOG-XXXX-XXXX-XXXX"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    disabled={redeeming}
                  />
                </div>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={redeeming || !keyInput.trim()}
                >
                  {redeeming ? 'Redeeming...' : 'Apply Key'}
                </Button>
              </form>
            )}
          </div>

          {errorMsg && <div className={css.errorBanner}>{errorMsg}</div>}
          {successMsg && <div className={css.successBanner}>{successMsg}</div>}

          <div className={css.footerActions}>
            <Button
              variant="outline"
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={redeeming}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
