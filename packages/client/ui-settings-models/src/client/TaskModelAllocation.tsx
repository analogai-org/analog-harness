/** Task allocations share Chat's reasoning and fast configurations. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelsSectionInjected } from './ModelsSection.tsx'
import styles from './ModelsSection.module.css'

const TASKS = [
  'preprocessing', 'srl', 'qa_synthesis', 'agent_execution', 'memory_summarization',
  'procedural_memory_summarization', 'procedural_memory_consolidation', 'turn_classification',
] as const

type Task = typeof TASKS[number]
type ModelType = 'reasoning' | 'fast'
type Allocations = Record<Task, ModelType>
type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; value: Allocations; pending: Task | null; error: Task | null; saved: Task | null }

/** Validate Chat's task response before offering editable allocations. */
function allocations(body: unknown): Allocations {
  if (body === null || typeof body !== 'object') throw new Error('Invalid task allocation response')
  return Object.fromEntries(TASKS.map((task) => {
    const assignment: unknown = Reflect.get(body, task)
    if (assignment === null || typeof assignment !== 'object' || !('model_type' in assignment)
      || (assignment.model_type !== 'fast' && assignment.model_type !== 'reasoning')) {
      throw new Error(`Invalid task allocation: ${task}`)
    }
    return [task, assignment.model_type]
  })) as Allocations
}

/**
 * Edit the same task allocations as Chat's dashboard; each choice saves immediately.
 * @param props - current Chat agent, localized copy, and post-commit catalog invalidation.
 * @returns the task allocation controls with query and field feedback.
 */
export function TaskModelAllocation({ agentId, t, onChanged }: {
  agentId: string
  t: ModelsSectionInjected['t']
  onChanged?: (() => void) | undefined
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const lifecycle = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    setState({ kind: 'loading' })
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`http://localhost:8071/v1/agents/${encodeURIComponent(agentId)}/task-models`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Could not load task allocations')
        const value = allocations(await response.json())
        if (!controller.signal.aborted) setState({ kind: 'ready', value, pending: null, error: null, saved: null })
      } catch (_taskAllocationQueryFailed) {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }
    void load()
    return () => { controller.abort() }
  }, [agentId, retry])

  const save = async (task: Task, modelType: ModelType): Promise<void> => {
    const controller = lifecycle.current
    if (controller === null || state.kind !== 'ready' || state.pending !== null) return
    if (state.value[task] === modelType) return
    setState({ ...state, pending: task, error: null, saved: null })
    try {
      controller.signal.throwIfAborted()
      const response = await fetch(`http://localhost:8071/v1/agents/${encodeURIComponent(agentId)}/task-models/${task}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: modelType }), signal: controller.signal,
      })
      if (!response.ok) throw new Error('Could not save task allocation')
      const result: unknown = await response.json()
      if (result === null || typeof result !== 'object' || !('model_type' in result) || result.model_type !== modelType) {
        throw new Error('Invalid saved task allocation')
      }
      if (controller.signal.aborted) return
      setState({ kind: 'ready', value: { ...state.value, [task]: modelType }, pending: null, error: null, saved: task })
      onChanged?.()
    } catch (_taskAllocationSaveFailed) {
      if (!controller.signal.aborted) setState({ ...state, pending: null, error: task, saved: null })
    }
  }

  return <section className={styles.sectionBlock} aria-label={t('taskAllocationTitle')}>
    <div className={styles.sectionHeaderWithSubtitle}>
      <h3 className={styles.taskTitle}>{t('taskAllocationTitle')}</h3>
      <p className={styles.sectionSubtitle}>{t('taskAllocationDescription')}</p>
    </div>
    {state.kind === 'error' ? <div role="alert">
      {t('taskAllocationLoadFailed')}{' '}
      <Button variant="outline" onClick={() => { setRetry(value => value + 1) }}>{t('retry')}</Button>
    </div> : <div className={styles.taskGrid} aria-busy={state.kind === 'loading' || state.pending !== null}>
      {TASKS.map(task => <label className={styles.taskCard} key={task}>
        <span className={styles.taskTitle}>{t(`task.${task}.label`)}</span>
        <span className={styles.taskDescription}>{t(`task.${task}.description`)}</span>
        <select className={styles.formSelect}
          value={state.kind === 'ready' ? state.value[task] : ''}
          disabled={state.kind !== 'ready' || state.pending !== null}
          aria-label={t(`task.${task}.label`)}
          onChange={(event) => { void save(task, event.target.value === 'reasoning' ? 'reasoning' : 'fast') }}>
          {state.kind === 'loading' && <option value="">{t('providerModelCatalogLoading')}</option>}
          <option value="reasoning">{t('taskReasoningModel')}</option>
          <option value="fast">{t('taskFastModel')}</option>
        </select>
        <span className={styles.taskFeedback} role="status">
          {state.kind === 'ready' && (state.error === task ? t('taskAllocationSaveFailed')
            : state.saved === task ? t('taskAllocationSaved') : '')}
        </span>
      </label>)}
    </div>}
  </section>
}
