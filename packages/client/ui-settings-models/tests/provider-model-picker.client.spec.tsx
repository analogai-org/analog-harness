// @vitest-environment jsdom
/** Catalogue suggestions preserve typed IDs and discard cancelled provider queries. */
import { useState, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderModelPicker } from '../src/client/ProviderModelPicker.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

type PickerProps = ComponentProps<typeof ProviderModelPicker>
type Models = Awaited<ReturnType<NonNullable<PickerProps['loadModels']>>>

function Editor({ providerId, loadModels, onSave = () => {} }: {
  providerId: string
  loadModels?: PickerProps['loadModels']
  onSave?: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); onSave(value) }}>
    <ProviderModelPicker
      providerId={providerId} value={value} onChange={setValue} t={key => en[key]}
      {...loadModels ? { loadModels } : {}}
    />
    <button type="submit">{en.apply}</button>
  </form>
}

it('copies the exact listed model ID into the input and saves later custom input', async () => {
  const onSave = vi.fn()
  render(<Editor providerId="provider" onSave={onSave} loadModels={async () => [
    { id: 'vendor/model:latest', name: 'Friendly name' },
  ]} />)
  await screen.findByRole('option', { name: 'Friendly name (vendor/model:latest)' })

  fireEvent.change(screen.getByRole('combobox', { name: en.providerModelCatalog }), {
    target: { value: 'vendor/model:latest' },
  })
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: en.modelId })
  expect(input.value).toBe('vendor/model:latest')
  fireEvent.change(input, { target: { value: 'private/custom-model-v2' } })
  fireEvent.click(screen.getByRole('button', { name: en.apply }))

  expect(onSave).toHaveBeenCalledWith('private/custom-model-v2')
  expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('')
})

it('allows a custom ID to be saved while the catalogue is loading', async () => {
  const request = Promise.withResolvers<Models>()
  const onSave = vi.fn()
  render(<Editor providerId="provider" onSave={onSave} loadModels={() => request.promise} />)
  try {
    expect(screen.getByRole<HTMLSelectElement>('combobox').disabled).toBe(true)
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: en.modelId })
    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { value: 'newly-released-model' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    expect(onSave).toHaveBeenCalledWith('newly-released-model')
  } finally {
    await act(async () => { request.resolve([{ id: 'listed-model' }]) })
  }
  expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('newly-released-model')
})

it.each(['empty', 'error'] as const)('keeps input and save available with an %s catalogue', async (outcome) => {
  const onSave = vi.fn()
  render(<Editor providerId="provider" onSave={onSave} loadModels={async () => {
    if (outcome === 'error') throw new Error('Provider unavailable')
    return []
  }} />)
  await screen.findByText(outcome === 'error' ? en.providerModelCatalogFailed : en.providerModelCatalogEmpty)

  const input = screen.getByRole<HTMLInputElement>('textbox', { name: en.modelId })
  const save = screen.getByRole<HTMLButtonElement>('button', { name: en.apply })
  expect(input.disabled).toBe(false)
  expect(save.disabled).toBe(false)
  fireEvent.change(input, { target: { value: 'custom-after-query' } })
  fireEvent.click(save)
  expect(onSave).toHaveBeenCalledWith('custom-after-query')
})

it('refetches when the provider changes without replacing the typed ID', async () => {
  const first = Promise.withResolvers<Models>()
  const second = Promise.withResolvers<Models>()
  const requests: { providerId: string; signal: AbortSignal }[] = []
  const loadModels = vi.fn((providerId: string, signal: AbortSignal) => {
    requests.push({ providerId, signal })
    return providerId === 'first' ? first.promise : second.promise
  })
  const { rerender } = render(<Editor providerId="first" loadModels={loadModels} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my-custom-id' } })
  rerender(<Editor providerId="second" loadModels={loadModels} />)
  try {
    expect(requests.map(request => request.providerId)).toEqual(['first', 'second'])
    expect(requests[0]?.signal.aborted).toBe(true)
    expect(requests[1]?.signal.aborted).toBe(false)
    await act(async () => { second.resolve([{ id: 'second-model' }]) })
    await screen.findByRole('option', { name: 'second-model' })
    await act(async () => { first.resolve([{ id: 'stale-first-model' }]) })
    expect(screen.queryByRole('option', { name: 'stale-first-model' })).toBeNull()
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('my-custom-id')
  } finally {
    await act(async () => { first.resolve([]); second.resolve([]) })
  }
})

it('ignores a late failure from the previous provider', async () => {
  const first = Promise.withResolvers<Models>()
  const second = Promise.withResolvers<Models>()
  const loadModels = (providerId: string) => providerId === 'first' ? first.promise : second.promise
  const { rerender } = render(<Editor providerId="first" loadModels={loadModels} />)
  rerender(<Editor providerId="second" loadModels={loadModels} />)
  try {
    await act(async () => { second.resolve([{ id: 'second-model' }]) })
    await act(async () => { first.reject(new Error('Old provider failed')) })
    expect(screen.queryByText(en.providerModelCatalogFailed)).toBeNull()
    expect(screen.getByRole('option', { name: 'second-model' })).toBeDefined()
  } finally {
    await act(async () => { first.resolve([]); second.resolve([]) })
  }
})

it('aborts the catalogue query on unmount and contains its late rejection', async () => {
  const request = Promise.withResolvers<Models>()
  const loadModels = vi.fn((_providerId: string, _signal: AbortSignal) => request.promise)
  const { unmount } = render(<Editor providerId="provider" loadModels={loadModels} />)
  const signal = loadModels.mock.calls[0]?.[1]
  try {
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  } finally {
    await act(async () => { request.reject(new Error('Cancelled query')) })
  }
})

it('supports manual input when no catalogue loader is supplied', () => {
  const onSave = vi.fn()
  render(<Editor providerId="provider" onSave={onSave} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'manual-model' } })
  fireEvent.click(screen.getByRole('button', { name: en.apply }))
  expect(onSave).toHaveBeenCalledWith('manual-model')
})
