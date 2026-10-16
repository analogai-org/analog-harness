import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SavingsBadge.module.css'

interface SavingsStats {
  summary?: {
    total_tokens: number
    prompt_tokens: number
    completion_tokens: number
    total_cost: number
    models_used: string[]
  }
  cache?: {
    hits: number
    misses: number
    hit_rate_pct: number
    prompt_tokens_saved: number
    completion_tokens_saved: number
    tokens_saved: number
  }
  savings?: {
    baseline_tokens: number
    actual_tokens: number
    tokens_saved: number
    savings_pct: number
    baseline_cost_usd: number
    actual_cost_usd: number
    cost_saved_usd: number
    cost_savings_pct: number
    cache_tokens_saved: number
    procedural_tokens_saved: number
    tiering_tokens_saved: number
  }
}

const DEFAULT_BASE_URL = 'http://localhost:8071'

function formatCompact(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`
  }
  return num.toLocaleString()
}

export function SavingsBadge() {
  const [stats, setStats] = useState<SavingsStats | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${DEFAULT_BASE_URL}/statistics`)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      // Backend not running or error, ignore gracefully
    }
  }, [])

  useEffect(() => {
    void fetchStats()
    const timer = setInterval(() => {
      void fetchStats()
    }, 10000)
    return () => clearInterval(timer)
  }, [fetchStats])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchStats()
    } finally {
      setRefreshing(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset session usage statistics?')) return
    try {
      await fetch(`${DEFAULT_BASE_URL}/statistics/reset`, { method: 'POST' })
      await fetchStats()
    } catch {
      // ignore
    }
  }

  const savings = stats?.savings
  const cache = stats?.cache
  const savingsPct = savings?.savings_pct ?? 0
  const tokensSaved = savings?.tokens_saved ?? 0
  const costSavedUsd = savings?.cost_saved_usd ?? 0
  const costSavingsPct = savings?.cost_savings_pct ?? 0
  const baselineTokens = savings?.baseline_tokens ?? 0
  const actualTokens = savings?.actual_tokens ?? 0
  const baselineCost = savings?.baseline_cost_usd ?? 0
  const actualCost = savings?.actual_cost_usd ?? 0

  const actualPercentOfBaseline = baselineTokens > 0 ? Math.min(100, (actualTokens / baselineTokens) * 100) : 0

  return (
    <div className={css.root}>
      <button
        type="button"
        className={css.badge}
        onClick={() => {
          setModalOpen(true)
          void fetchStats()
        }}
        title={`Analog AI Saved ${tokensSaved.toLocaleString()} tokens ($${costSavedUsd.toFixed(4)}) - Click for details`}
      >
        <span className={css.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </span>
        <span className={css.percent}>
          {savingsPct.toFixed(1)}% Saved
        </span>
        <span className={css.label}>
          ({formatCompact(tokensSaved)} tok)
        </span>
      </button>

      <a
        href="http://localhost:8071"
        target="_blank"
        rel="noreferrer"
        className={css.moreLink}
        title="Open AnalogAI Dashboard"
      >
        More ↗
      </a>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Analog AI Token & Cost Savings"
        closeLabel="Close"
        description="Live efficiency metrics comparing pure reasoning model execution against Analog AI's procedural distillation, caching, and model tiering."
      >
        <div className={css.dialogBody}>
          <div className={css.metricsGrid}>
            <div className={css.metricCard}>
              <div className={css.metricTitle}>Tokens Saved</div>
              <div className={css.metricValue}>{tokensSaved.toLocaleString()}</div>
              <div className={css.metricSubtext}>{savingsPct.toFixed(1)}% Token Reduction</div>
            </div>

            <div className={css.metricCard}>
              <div className={css.metricTitle}>Cost Saved</div>
              <div className={css.metricValue}>${costSavedUsd.toFixed(4)}</div>
              <div className={css.metricSubtext}>{costSavingsPct.toFixed(1)}% Financial Savings</div>
            </div>

            <div className={css.metricCard}>
              <div className={css.metricTitle}>Cache Hit Rate</div>
              <div className={css.metricValue}>{(cache?.hit_rate_pct ?? 0).toFixed(1)}%</div>
              <div className={css.metricSubtext}>{(cache?.hits ?? 0)} hits / {(cache?.misses ?? 0)} misses</div>
            </div>
          </div>

          <div className={css.comparisonSection}>
            <div className={css.comparisonHeader}>
              <span className={css.comparisonTitle}>Reasoning Baseline vs Actual Execution</span>
            </div>

            <div className={css.comparisonRows}>
              <div className={css.comparisonRow}>
                <div className={css.comparisonRowHeader}>
                  <span className={css.baselineLabel}>Original Baseline (Reasoning Only)</span>
                  <span className={css.baselineValue}>
                    {baselineTokens.toLocaleString()} tokens (${baselineCost.toFixed(4)})
                  </span>
                </div>
                <div className={css.barTrack}>
                  <div className={css.barFillBaseline} />
                </div>
              </div>

              <div className={css.comparisonRow}>
                <div className={css.comparisonRowHeader}>
                  <span className={css.actualLabel}>Analog AI Actual Usage</span>
                  <span className={css.actualValue}>
                    {actualTokens.toLocaleString()} tokens (${actualCost.toFixed(4)})
                  </span>
                </div>
                <div className={css.barTrack}>
                  <div
                    className={css.barFillActual}
                    style={{ width: `${actualPercentOfBaseline}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={css.breakdownSection}>
            <div className={css.breakdownTitle}>Optimization Sources</div>
            <div className={css.breakdownList}>
              <div className={css.breakdownItem}>
                <div className={css.breakdownItemLeft}>
                  <span>⚡ Prompt & Context Caching</span>
                </div>
                <div className={css.breakdownItemValue}>
                  +{(savings?.cache_tokens_saved ?? 0).toLocaleString()} tokens
                </div>
              </div>

              <div className={css.breakdownItem}>
                <div className={css.breakdownItemLeft}>
                  <span>🧠 Procedural Memory Distillation</span>
                </div>
                <div className={css.breakdownItemValue}>
                  +{(savings?.procedural_tokens_saved ?? 0).toLocaleString()} tokens
                </div>
              </div>

              <div className={css.breakdownItem}>
                <div className={css.breakdownItemLeft}>
                  <span>🚀 Smart Multi-Tier Routing</span>
                </div>
                <div className={css.breakdownItemValue}>
                  +{(savings?.tiering_tokens_saved ?? 0).toLocaleString()} tokens
                </div>
              </div>
            </div>
          </div>

          <div className={css.footerRow}>
            <button
              type="button"
              className={css.resetBtn}
              onClick={() => void handleReset()}
            >
              Reset Statistics
            </button>
            <button
              type="button"
              className={css.refreshBtn}
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
