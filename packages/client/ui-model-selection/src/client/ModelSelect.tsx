/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Dropdown showing provider-grouped model list over the shared directory.
 */
import { MenuGroup, MenuSurface, observeStickyMenuGroups } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type FocusEvent,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ModelSelection, ModelReasoning } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular,
  IconCloseFillRegular, IconDataOutlineRegular, IconWarningOutlineRegular, Input, rankByName, StateDot, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'
import { orderModelProviders } from './provider-order.ts'

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

type Pane = 'model' | 'effort'

interface EffortOption {
  id: string
  name: string
}

export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked?: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )

  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('model')
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [selectionFocus, setSelectionFocus] = useState(false)

  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const groupsRef = useRef<HTMLDivElement | null>(null)
  const [menuPos, setMenuPos] = useState<CSSProperties | null>(null)

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  const groups = useMemo(() => orderModelProviders(state.groups), [state.groups])

  const choices = useMemo(() => groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
      } satisfies ModelSelection,
    }))), [groups])

  const showSearch = choices.length > 4

  const filteredGroups = useMemo(() => groups.map(group => ({
    ...group, models: rankByName(group.models, (pane === 'model' && showSearch) ? query.trim() : ''),
  })).filter(group => group.models.length > 0), [groups, query, showSearch, pane])

  const visibleModels = useMemo(() => filteredGroups.flatMap(group => group.models.map(model => ({
    provider: group.id, model: model.id, name: model.name, reasoning: model.reasoning,
  }))), [filteredGroups])

  const selectedModelIndex = state.current === null
    ? -1
    : visibleModels.findIndex(m => m.provider === state.current?.provider && m.model === state.current.model)

  const currentChoice = useMemo(() => {
    if (state.current === null) return undefined
    return choices.find(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  }, [choices, state.current])

  const currentModelDef = currentChoice?.model

  const reasoning = currentModelDef?.reasoning

  const effortOptions = useMemo<EffortOption[]>(() => {
    if (!reasoning) return []
    const list: EffortOption[] = []
    if (reasoning.defaultEffort === undefined) {
      list.push({ id: '', name: t('effort.providerDefault') })
    }
    for (const eff of reasoning.efforts) {
      list.push({ id: eff.id, name: eff.name })
    }
    return list
  }, [reasoning, t])

  const hasEffortOptions = effortOptions.length > 0

  const activeEffortId = state.current?.reasoningEffort ?? (reasoning?.defaultEffort ?? '')
  const activeEffortName = effortOptions.find(e => e.id === activeEffortId)?.name ?? state.current?.reasoningEffort

  const activeModelIndex = Math.min(
    highlightedIndex ?? (selectedModelIndex >= 0 ? selectedModelIndex : 0),
    Math.max(0, visibleModels.length - 1),
  )

  const activeModelIndexClamped = visibleModels.length === 0 ? -1 : activeModelIndex

  const { pending } = state
  const busy = pending !== null

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  useLayoutEffect(() => {
    if (!showSearch || pane !== 'model') {
      setQuery('')
      setHighlightedIndex(null)
    }
  }, [showSearch, pane])

  useEffect(() => {
    if (!open) return

    if (pane === 'model' && showSearch) {
      searchRef.current?.focus()
      return
    }
    const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
    const target = checked ?? itemRefs.current.find(item => item !== null && !item.disabled)
    ;(target ?? triggerRef.current)?.focus()
  }, [open, pane, showSearch])

  useEffect(() => {
    const viewport = groupsRef.current
    if (viewport === null) return
    return observeStickyMenuGroups(viewport)
  }, [available, open, filteredGroups, pane])

  useLayoutEffect(() => {
    if (open && pane === 'model' && activeModelIndexClamped >= 0) {
      itemRefs.current[activeModelIndexClamped]?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, pane, activeModelIndexClamped, visibleModels])

  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    const place = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const MARGIN = 12
      const lw = menuRef.current?.offsetWidth ?? 0
      const lh = menuRef.current?.offsetHeight ?? 0
      let x = rect.right - lw
      let y = rect.top - 8 - lh
      if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN)
      if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN)
      setMenuPos({ left: x, top: y })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, state, query, pane])

  if (!available) return null

  const show = (): void => {
    setSelectionFocus(false)
    triggerRef.current?.focus()
    setQuery('')
    setHighlightedIndex(null)
    setPane('model')
    setOpen(true)
    reload()
  }

  const changeQuery = (next: string): void => {
    setQuery(next)
    setHighlightedIndex(0)
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    setPane('model')
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const closeAfterSelection = (): void => {
    setSelectionFocus(true)
    close(true)
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = active === -1
      ? (offset > 0 ? 0 : items.length - 1)
      : (active + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      if (pane === 'effort') {
        setPane('model')
      } else close(true)
      return
    }
    if (!open) return

    if (pane === 'model' && showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (!busy && visibleModels.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setHighlightedIndex((activeModelIndex + direction + visibleModels.length) % visibleModels.length)
        searchRef.current?.focus()
      }
      return
    }

    if (pane === 'model' && showSearch && event.target instanceof HTMLInputElement
      && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      if (event.key === 'Tab' && visibleModels.length === 0) return
      event.preventDefault()
      const highlighted = visibleModels[activeModelIndex]
      if (!busy && highlighted !== undefined) chooseModel(highlighted)
      return
    }

    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        if (pane === 'effort') {
          setPane('model')
        } else close(true)
        return
      }

      const focused = document.activeElement
      const rows = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
      if (focused instanceof HTMLButtonElement && (rows.includes(focused) || focused.getAttribute('role') === 'menuitemradio')) {
        event.preventDefault()
        focused.click()
        return
      }

      if (focused !== triggerRef.current) return
      event.preventDefault()
      if (pane === 'model' && showSearch) {
        setHighlightedIndex(null)
        searchRef.current?.focus()
        return
      }
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      ;(checked ?? rows.find(item => !item.disabled))?.focus()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && (
      rootRef.current?.contains(event.relatedTarget) === true
      || menuRef.current?.contains(event.relatedTarget) === true
    )) return
    close()
  }

  const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>): void => {
    if (result === undefined) return
    if (result.ok) {
      if (rootRef.current !== null) closeAfterSelection()
      return
    }
    const { error } = result
    toastSeq.current += 1
    setToast({
      seq: toastSeq.current,
      text: error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${error.code}: ${error.message}` }),
    })
  }

  const submit = (selection: ModelSelection): void => {
    lastActionRef.current = 'select'
    setSelectionFocus(true)
    triggerRef.current?.focus()
    void select(selection).then(settleSelection)
  }

  const chooseModel = (model: { provider: string; model: string; reasoning?: ModelReasoning | undefined }): void => {
    const nextSelection: ModelSelection = {
      provider: model.provider,
      model: model.model,
      ...(model.reasoning?.defaultEffort ? { reasoningEffort: model.reasoning.defaultEffort } : {}),
    }
    if (state.current?.provider === nextSelection.provider && state.current.model === nextSelection.model) {
      closeAfterSelection()
      return
    }
    submit(nextSelection)
  }

  const chooseEffort = (effort: EffortOption): void => {
    if (state.current === null) return
    const nextSelection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...(effort.id !== '' ? { reasoningEffort: effort.id } : {}),
    }
    if (state.current.reasoningEffort === (effort.id || undefined)) {
      closeAfterSelection()
      return
    }
    submit(nextSelection)
  }

  const waiting = state.current === null && state.status === 'loading'
  const modelName = currentChoice?.model.name
    ?? (state.current === null ? undefined : state.current.model)
  const effortLabel = state.retainedEffort ?? activeEffortName

  const triggerLabel = waiting
    ? t('trigger.loading')
    : (modelName ?? t('trigger.fallback'))

  const triggerAria = waiting
    ? t('trigger.loading')
    : state.current === null
      ? t('trigger.selectAria')
      : (effortLabel ? t('trigger.ariaEffort', { model: triggerLabel, effort: effortLabel }) : t('trigger.aria', { model: triggerLabel }))

  itemRefs.current = []
  let itemIndex = 0
  let modelIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  return (
    <div
      ref={rootRef}
      className={css.root}
      onKeyDown={onRootKeyDown}
      onBlur={onBlur}
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        aria-busy={busy}
        data-selection-focus={selectionFocus ? '' : undefined}
        onBlur={() => { setSelectionFocus(false) }}
        disabled={locked}
        onClick={() => {
          if (open) {
            close(true)
          } else {
            show()
          }
        }}
      >
        <IconDataOutlineRegular className={css.triggerIcon} size={16} />
        <span className={css.triggerLabel}>{triggerLabel}</span>
        {effortLabel && <span className={css.triggerEffort}>{effortLabel}</span>}
        {busy
          ? <StateDot state="ongoing" />
          : <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />}
      </button>

      {open && createPortal(
        <MenuSurface
          ref={menuRef}
          id={`${id}-menu`}
          className={css.menu}
          style={menuPos ?? MEASURE_STYLE}
          role={(filteredGroups.length === 0 && pane === 'model' && query !== '') || (filteredGroups.length === 0 && pane === 'model' && query === '' && state.status === 'ready') || (showSearch && pane === 'model' && query === 'zzzz') ? undefined : (showSearch && pane === 'model' ? undefined : 'menu')}
          aria-label={pane === 'model' ? t('menu.model') : t('menu.effort')}
          aria-busy={state.status === 'loading' || busy}
        >
          <div role="group" aria-label={t('menu.aria')}>
            {pane === 'model' && (
              <>
                {showSearch && (
                  <div className={css.searchRow}>
                    <Input
                      ref={searchRef}
                      className={clsx(css.search, query !== '' && css.searchWithQuery)}
                      type="text"
                      role="searchbox"
                      aria-label={t('search.placeholder')}
                      aria-controls={`${id}-models`}
                      aria-activedescendant={activeModelIndexClamped < 0 || activeModelIndexClamped >= visibleModels.length ? undefined : `${id}-model-${activeModelIndexClamped}`}
                      placeholder={t('search.placeholder')}
                      value={query}
                      readOnly={busy}
                      onChange={(event) => { changeQuery(event.target.value) }}
                    />
                    {query !== '' && (
                      <button
                        type="button"
                        className={css.searchClear}
                        aria-label={t('search.clear')}
                        disabled={busy}
                        onClick={() => {
                          changeQuery('')
                          searchRef.current?.focus()
                        }}
                      >
                        <IconCloseFillRegular />
                      </button>
                    )}
                  </div>
                )}
                {state.status === 'loading' && (
                  <div className={css.status}>{t('status.loading')}</div>
                )}
                {state.error !== null && lastActionRef.current === 'load' && (
                  <div className={css.error}>
                    <span>{t('error.action', { message: state.error })}</span>
                    <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                  </div>
                )}
                {state.failures.map(failure => (
                  <div className={css.warning} key={failure.id}>
                    <span>{t('warning.groupLoad', { name: failure.id === 'deepseek-account' ? t('provider.account') : failure.name, message: failure.message })}</span>
                    <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
                  </div>
                ))}
                <div
                  ref={groupsRef}
                  id={`${id}-models`}
                  className={clsx(css.groups, 'scrollable')}
                  role={showSearch && filteredGroups.length > 0 ? 'menu' : undefined}
                  aria-label={showSearch && filteredGroups.length > 0 ? t('menu.model') : undefined}
                  hidden={filteredGroups.length === 0}
                >
                  {filteredGroups.map((group) => {
                    return (
                      <MenuGroup key={group.id} label={group.id === 'deepseek-account' ? t('provider.account') : group.name}>
                        {group.models.map((model) => {
                          const index = modelIndex++
                          const selected = state.current?.provider === group.id && state.current.model === model.id
                          const highlighted = showSearch ? index === activeModelIndexClamped : (highlightedIndex === index || undefined)
                          return (
                            <button
                              ref={itemRef()}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              id={`${id}-model-${index}`}
                              tabIndex={showSearch ? -1 : 0}
                              onFocus={() => { setHighlightedIndex(index) }}
                              data-highlighted={highlighted ? '' : undefined}
                              className={clsx(
                                css.option, css.modelOption, selected && css.selected, highlighted && css.optionActive,
                              )}
                              onMouseMove={busy ? undefined : () => {
                                setHighlightedIndex(index)
                                if (!showSearch) itemRefs.current[index]?.focus()
                              }}
                              key={model.id}
                              title={model.name}
                              disabled={busy}
                              onClick={() => { chooseModel({ provider: group.id, model: model.id, reasoning: model.reasoning }) }}
                            >
                              <span className={css.optionCopy}>
                                <span className={css.modelNameRow}>
                                  <span className={css.modelName}>{model.name}</span>
                                </span>
                              </span>
                              <span className={css.check}>
                                {pending?.provider === group.id && pending.model === model.id
                                  ? <StateDot state="ongoing" />
                                  : selected ? <IconCheckOutlineRegular /> : null}
                              </span>
                            </button>
                          )
                        })}
                      </MenuGroup>
                    )
                  })}
                </div>
                {state.status === 'ready' && filteredGroups.length === 0 && (
                  <div className={css.empty} role="status">{t(choices.length === 0 ? 'empty.models' : 'search.empty')}</div>
                )}
                {hasEffortOptions && state.current !== null && (
                  <button
                    ref={itemRef()}
                    type="button"
                    role="menuitem"
                    className={css.cell}
                    onClick={() => {
                      setPane('effort')
                    }}
                  >
                    <span className={css.cellLabel}>{t('menu.effort')}</span>
                    <span className={css.cellValue}>{effortLabel}</span>
                    <IconChevronRightOutlineRegular className={css.cellChevron} />
                  </button>
                )}
              </>
            )}

            {pane === 'effort' && (
              <div
                className={clsx(css.groups, 'scrollable')}
              >
                {effortOptions.map((effort, index) => {
                  const selected = activeEffortId === effort.id
                  return (
                    <button
                      ref={itemRef()}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      id={`${id}-effort-${index}`}
                      tabIndex={0}
                      className={clsx(css.option, selected && css.selected)}
                      key={effort.id}
                      disabled={busy}
                      onClick={() => { chooseEffort(effort) }}
                    >
                      <span className={css.optionCopy}>
                        <span className={css.modelName}>{effort.name}</span>
                      </span>
                      <span className={css.check}>
                        {pending?.reasoningEffort === (effort.id || undefined)
                          ? <StateDot state="ongoing" />
                          : selected ? <IconCheckOutlineRegular /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </MenuSurface>,
        document.body,
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
