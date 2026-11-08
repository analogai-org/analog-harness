// @vitest-environment jsdom
/** Task edits persist to Chat, retain saved values on failure, and survive remounts. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TaskModelAllocation } from '../src/client/TaskModelAllocation.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const tasks = [
  'preprocessing', 'srl', 'qa_synthesis', 'agent_execution', 'memory_summarization',
  'procedural_memory_summarization', 'procedural_memory_consolidation', 'turn_classification',
]

function backend() {
  const values = Object.fromEntries(tasks.map(task => [task, {
    model_type: task === 'agent_execution' || task === 'procedural_memory_consolidation' ? 'reasoning' : 'fast',
  }]))
  let fail = false
  const send = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    if (init?.method !== 'PUT') return Response.json(values)
    if (fail) return Response.json({ detail: 'Unavailable' }, { status: 500 })
    const task = path.split('/').at(-1)!
    const value = JSON.parse(String(init.body)) as { model_type: string }
    values[task] = value
    return Response.json({ task_type: task, ...value })
  })
  vi.stubGlobal('fetch', send)
  return { send, failSave: () => { fail = true } }
}

it.each([en, zh])('offers all eight tasks with localized labels and backend values', async (copy) => {
  backend()
  render(<TaskModelAllocation agentId="default" t={key => copy[key]} />)
  const main = screen.getByRole<HTMLSelectElement>('combobox', { name: copy['task.agent_execution.label'] })
  await waitFor(() => { expect(main.disabled).toBe(false) })
  expect(screen.getAllByRole('combobox')).toHaveLength(8)
  expect(main.value).toBe('reasoning')
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: copy['task.preprocessing.label'] }).value).toBe('fast')
  for (const select of screen.getAllByRole('combobox')) {
    expect(Array.from((select as HTMLSelectElement).options, option => option.value)).toEqual(['reasoning', 'fast'])
  }
})

it('persists a changed allocation, invalidates the catalog, and reloads it on remount', async () => {
  const { send } = backend()
  const onChanged = vi.fn()
  const view = render(<TaskModelAllocation agentId="default" t={key => en[key]} onChanged={onChanged} />)
  const main = screen.getByRole<HTMLSelectElement>('combobox', { name: en['task.agent_execution.label'] })
  await waitFor(() => { expect(main.disabled).toBe(false) })
  fireEvent.change(main, { target: { value: 'fast' } })
  await screen.findByText(en.taskAllocationSaved)
  expect(main.value).toBe('fast')
  expect(onChanged).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith('http://localhost:8071/v1/agents/default/task-models/agent_execution',
    expect.objectContaining({ method: 'PUT', body: '{"model_type":"fast"}' }))
  view.unmount()
  render(<TaskModelAllocation agentId="default" t={key => en[key]} />)
  await waitFor(() => {
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: en['task.agent_execution.label'] }).value).toBe('fast')
  })
})

it('keeps the saved allocation when a write fails', async () => {
  const api = backend()
  const onChanged = vi.fn()
  render(<TaskModelAllocation agentId="default" t={key => en[key]} onChanged={onChanged} />)
  const main = screen.getByRole<HTMLSelectElement>('combobox', { name: en['task.agent_execution.label'] })
  await waitFor(() => { expect(main.disabled).toBe(false) })
  api.failSave()
  fireEvent.change(main, { target: { value: 'fast' } })
  await screen.findByText(en.taskAllocationSaveFailed)
  expect(main.value).toBe('reasoning')
  expect(main.disabled).toBe(false)
  expect(onChanged).not.toHaveBeenCalled()
})

it('offers retry for a malformed task response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(
    Object.fromEntries(tasks.map(task => [task, { model_type: 'fast' }])),
  )))
  render(<TaskModelAllocation agentId="default" t={key => en[key]} />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: en.retry }))
  await waitFor(() => { expect(screen.getAllByRole('combobox')).toHaveLength(8) })
})

it('discards an old agent response after the selected agent changes', async () => {
  const first = Promise.withResolvers<Response>()
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((input: string, init: RequestInit) => {
    if (input.includes('/first/')) {
      signal = init.signal ?? undefined
      return first.promise
    }
    return Promise.resolve(Response.json(Object.fromEntries(tasks.map(task => [task, { model_type: 'fast' }]))))
  }))
  const view = render(<TaskModelAllocation agentId="first" t={key => en[key]} />)
  view.rerender(<TaskModelAllocation agentId="second" t={key => en[key]} />)
  expect(signal?.aborted).toBe(true)
  await act(async () => { first.resolve(Response.json({})) })
  await waitFor(() => {
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: en['task.agent_execution.label'] }).value).toBe('fast')
  })
  expect(screen.queryByRole('alert')).toBeNull()
})
