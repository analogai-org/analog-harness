/** Desktop welcome presentation; Minimalist 2-step Analog AI onboarding wizard using DeepSeek UI design. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import type { WelcomeApi, AnalogSetupParams } from '../welcome-api.ts'

interface ProviderPreset {
  name: string
  baseUrl: string
  teacherModel: string
  studentModel: string
  keyRequired: boolean
}

const FALLBACK_DEFAULT: ProviderPreset = {
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  teacherModel: 'deepseek-reasoner',
  studentModel: 'deepseek-chat',
  keyRequired: true,
}

export function Welcome({ api }: { api: WelcomeApi }) {
  // Step 0: Welcome overview with "Start Configuration" button
  // Step 1: Add Providers
  // Step 2: Add Teacher & Student models
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [providers, setProviders] = useState<Record<string, ProviderPreset>>({
    deepseek: FALLBACK_DEFAULT,
  })

  const [providerType, setProviderType] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(FALLBACK_DEFAULT.baseUrl)
  const [teacherModel, setTeacherModel] = useState(FALLBACK_DEFAULT.teacherModel)
  const [studentModel, setStudentModel] = useState(FALLBACK_DEFAULT.studentModel)

  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    document.title = 'Analog AI Harness Setup'

    // Fetch dynamic available providers from chat microservice localhost:8071
    fetch('http://localhost:8071/available-providers')
      .catch(() => fetch('http://localhost:8071/v1/available-providers'))
      .then((res) => {
        if (res && res.ok) return res.json()
        throw new Error('Failed to fetch providers')
      })
      .then((data) => {
        if (data && Array.isArray(data.providers) && data.providers.length > 0) {
          const map: Record<string, ProviderPreset> = {}
          for (const p of data.providers) {
            map[p.id] = {
              name: p.name,
              baseUrl: p.baseUrl || p.base_url || '',
              teacherModel: p.teacherModel || p.teacher_model || '',
              studentModel: p.studentModel || p.student_model || '',
              keyRequired: p.keyRequired ?? p.key_required ?? true,
            }
          }
          if (mounted.current) {
            setProviders(map)
            // If the currently selected provider is present in map, sync its values if not edited
            const active = map[providerType] || map[data.providers[0].id]
            if (active && !apiKey) {
              setBaseUrl(active.baseUrl)
              setTeacherModel(active.teacherModel)
              setStudentModel(active.studentModel)
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Could not fetch available providers from microservice:', err)
      })

    return () => {
      mounted.current = false
    }
  }, [])

  function handleProviderChange(type: string) {
    setProviderType(type)
    const preset = providers[type]
    if (preset) {
      setBaseUrl(preset.baseUrl)
      if (preset.teacherModel) setTeacherModel(preset.teacherModel)
      if (preset.studentModel) setStudentModel(preset.studentModel)
    }
    setError('')
  }

  function handleStep1Next() {
    const preset = providers[providerType]
    const keyRequired = preset ? preset.keyRequired : true

    if (keyRequired && !apiKey.trim()) {
      setError(`Please provide an API key for ${preset?.name ?? providerType}`)
      return
    }

    if ((providerType === 'custom' || providerType === 'ollama') && !baseUrl.trim()) {
      setError('Please provide a Base URL for your provider.')
      return
    }

    setError('')
    setStep(2)
  }

  async function handleSubmit(event?: FormEvent) {
    if (event) event.preventDefault()
    if (busy) return

    if (!teacherModel.trim()) {
      setError('Please specify a Teacher (Reasoning) model.')
      return
    }

    if (!studentModel.trim()) {
      setError('Please specify a Student (Fast) model.')
      return
    }

    setBusy(true)
    setError('')
    setStatusMessage('Configuring Analog AI distillation proxy...')

    const params: AnalogSetupParams = {
      providerType,
      providerApiKey: apiKey.trim(),
      providerBaseUrl: baseUrl.trim() || undefined,
      reasoningModel: teacherModel.trim(),
      fastModel: studentModel.trim(),
      agentName: 'Analog Assistant',
    }

    try {
      const result = await api.saveSetup(params)
      if (!mounted.current) return
      if (!result.ok) {
        setError(result.error ?? 'Failed to complete Analog AI setup. Please verify the local server.')
        setBusy(false)
        setStatusMessage('')
      }
    } catch (err: unknown) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred during setup.')
        setBusy(false)
        setStatusMessage('')
      }
    }
  }

  async function handleSkip() {
    if (busy) return
    setBusy(true)
    try {
      await api.skip()
    } catch {
      if (mounted.current) {
        setError('Failed to skip setup.')
        setBusy(false)
      }
    }
  }

  const selectedPreset = providers[providerType] ?? FALLBACK_DEFAULT
  const showBaseUrl = providerType === 'custom' || providerType === 'ollama'

  return (
    <>
      <div className="titlebar" aria-hidden="true" />
      <main className="welcome">
        <img className="brand" src="assets/analog-logo.png" alt="Analog AI" />

        {/* STEP 0: ENTRY */}
        {step === 0 && (
          <>
            <div id="tagline" className="tagline">
              <h1 id="welcome-heading">
                <span>Welcome to </span>
                <em>Analog AI</em>
                <span> Harness</span>
              </h1>
              <p id="welcome-description">
                Harness for reasoning & executor agents
              </p>
            </div>

            <div id="entry-actions" className="actions">
              <button
                id="start-config-btn"
                className="primary"
                type="button"
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                Start Configuration
              </button>
              <button
                id="skip-config-btn"
                className="secondary"
                type="button"
                onClick={() => {
                  void handleSkip()
                }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* STEP 1: PROVIDER SETUP */}
        {step === 1 && (
          <>
            <div className="key-form">
              <header className="key-heading">
                <h1>Step 1 of 2: Model Provider</h1>
                <p>Choose your provider and configure API credentials</p>
              </header>

              <div className="key-field">
                <label htmlFor="provider-select">Provider</label>
                <select
                  id="provider-select"
                  value={providerType}
                  disabled={busy}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {Object.entries(providers).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="key-field">
                <label htmlFor="key-input">
                  {selectedPreset.keyRequired ? 'API Key' : 'API Key (Optional)'}
                </label>
                <input
                  id="key-input"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={selectedPreset.keyRequired ? 'Enter your API key...' : 'Optional'}
                  value={apiKey}
                  disabled={busy}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setError('')
                  }}
                  autoFocus
                />
              </div>

              {showBaseUrl && (
                <div className="key-field">
                  <label htmlFor="base-url-input">Base URL</label>
                  <input
                    id="base-url-input"
                    type="text"
                    placeholder="e.g. http://localhost:11434/v1"
                    value={baseUrl}
                    disabled={busy}
                    onChange={(e) => {
                      setBaseUrl(e.target.value)
                      setError('')
                    }}
                  />
                </div>
              )}

              {error && (
                <p className="key-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="actions">
              <button
                id="step1-next-btn"
                className="primary"
                type="button"
                onClick={handleStep1Next}
              >
                Next
              </button>
              <button
                id="step1-back-btn"
                className="back"
                type="button"
                onClick={() => {
                  setError('')
                  setStep(0)
                }}
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* STEP 2: DISTILLATION MODELS */}
        {step === 2 && (
          <>
            <form className="key-form" onSubmit={(e) => { void handleSubmit(e) }}>
              <header className="key-heading">
                <h1>Step 2 of 2: Distillation Models</h1>
                <p>Configure Teacher (reasoning) & Student (fast executor) models</p>
              </header>

              <div className="key-field">
                <label htmlFor="teacher-model-input">Teacher Model (Reasoning)</label>
                <input
                  id="teacher-model-input"
                  type="text"
                  placeholder="e.g. deepseek-reasoner"
                  value={teacherModel}
                  disabled={busy}
                  onChange={(e) => {
                    setTeacherModel(e.target.value)
                    setError('')
                  }}
                  autoFocus
                />
              </div>

              <div className="key-field">
                <label htmlFor="student-model-input">Student Model (Fast Executor)</label>
                <input
                  id="student-model-input"
                  type="text"
                  placeholder="e.g. deepseek-chat"
                  value={studentModel}
                  disabled={busy}
                  onChange={(e) => {
                    setStudentModel(e.target.value)
                    setError('')
                  }}
                />
              </div>

              {error && (
                <p className="key-error" role="alert">
                  {error}
                </p>
              )}

              {busy && (
                <div className="key-status">
                  <StateDot state="ongoing" size={14} />
                  <span>{statusMessage}</span>
                </div>
              )}
            </form>

            <div className="actions">
              <button
                id="finish-btn"
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => { void handleSubmit() }}
              >
                {busy ? <StateDot state="ongoing" size={16} /> : 'Launch Harness'}
              </button>
              <button
                id="step2-back-btn"
                className="back"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </main>
    </>
  )
}
