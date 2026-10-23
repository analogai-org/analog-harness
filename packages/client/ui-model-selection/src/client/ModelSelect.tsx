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
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconCloseFillRegular,
  IconDataOutlineRegular, IconWarningOutlineRegular, Input, rankByName, StateDot, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'
import { orderModelProviders } from './provider-order.ts'

/** Configured model from local storage */
interface ConfiguredModelItem {
  id: string
  name: string
  provider: string
  category?: string
  maxTokens?: number
}

function loadConfiguredModels(): ConfiguredModelItem[] {
  try {
    const raw = localStorage.getItem('analog_configured_models')
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return []
}

const EditIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

function getDualModelLabel(
  group: { id: string; name: string; models: readonly { id: string; name: string; description?: string; reasoning?: unknown }[] } | undefined,
): string | undefined {
  if (!group || !group.models || group.models.length === 0) return undefined
  const first = group.models[0]
  if (group.models.length === 1 && first) return first.name || first.id

  // Find reasoning model
  const reasoningModel = group.models.find(m =>
    m.description?.toLowerCase().includes('reason') ||
    m.reasoning !== undefined ||
    m.id.toLowerCase().includes('reason') ||
    m.id.toLowerCase().includes('o1') ||
    m.id.toLowerCase().includes('o3') ||
    m.id.toLowerCase().includes('r1') ||
    m.id.toLowerCase().includes('opus') ||
    m.id.toLowerCase().includes('sonnet') ||
    m.id.toLowerCase().includes('pro') ||
    m.id === 'gpt-4o'
  )

  // Find fast model
  const fastModel = group.models.find(m =>
    m.description?.toLowerCase().includes('fast') ||
    m.id.toLowerCase().includes('mini') ||
    m.id.toLowerCase().includes('flash') ||
    m.id.toLowerCase().includes('haiku') ||
    m.id.toLowerCase().includes('fast') ||
    m.id.toLowerCase().includes('nano')
  )

  if (reasoningModel && fastModel && reasoningModel.id !== fastModel.id) {
    const rName = reasoningModel.name || reasoningModel.id
    const fName = fastModel.name || fastModel.id
    return `${rName}/${fName}`
  }

  if (group.models.length === 2) {
    const withReasoning = group.models.find(m => m.reasoning !== undefined || m.description === 'Reasoning')
    const withoutReasoning = group.models.find(m => m !== withReasoning)
    if (withReasoning && withoutReasoning) {
      return `${withReasoning.name || withReasoning.id}/${withoutReasoning.name || withoutReasoning.id}`
    }
    const m0 = group.models[0]
    const m1 = group.models[1]
    if (m0 && m1) {
      return `${m0.name || m0.id}/${m1.name || m1.id}`
    }
  }

  return undefined
}

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real (Menu primitive's measure pass). */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the model selection menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [configuredModels, setConfiguredModels] = useState<ConfiguredModelItem[]>(loadConfiguredModels)

  useEffect(() => {
    const onUpdate = () => {
      setConfiguredModels(loadConfiguredModels())
    }
    window.addEventListener('analog-models-updated', onUpdate)
    return () => {
      window.removeEventListener('analog-models-updated', onUpdate)
    }
  }, [])

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [selectionFocus, setSelectionFocus] = useState(false)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
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

  const groups = useMemo(() => {
    const baseGroups = orderModelProviders(state.groups)
    if (configuredModels.length === 0) return baseGroups

    const groupMap = new Map<string, { id: string; name: string; models: Array<{ id: string; name: string; description?: string; reasoning?: any }> }>()
    for (const bg of baseGroups) {
      groupMap.set(bg.id, {
        id: bg.id,
        name: bg.name,
        models: [...bg.models],
      })
    }
    for (const cm of configuredModels) {
      const provId = cm.provider || 'custom'
      const provName = provId.charAt(0).toUpperCase() + provId.slice(1)
      let g = groupMap.get(provId)
      if (!g) {
        g = { id: provId, name: provName, models: [] }
        groupMap.set(provId, g)
      }
      if (!g.models.some(m => m.id === cm.id)) {
        g.models.push({
          id: cm.id,
          name: cm.name,
        })
      }
    }
    return Array.from(groupMap.values())
  }, [state.groups, configuredModels])

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
    ...group, models: rankByName(group.models, showSearch ? query.trim() : ''),
  })).filter(group => group.models.length > 0), [groups, query, showSearch])
  const visibleModels = useMemo(() => filteredGroups.flatMap(group => group.models.map(model => ({
    provider: group.id, model: model.id,
  }))), [filteredGroups])
  const currentVisibleIndex = visibleModels.findIndex(model =>
    model.provider === state.current?.provider && model.model === state.current.model)
  const activeModelIndex = Math.min(highlightedIndex ?? Math.max(0, currentVisibleIndex), visibleModels.length - 1)
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const activeGroup = currentChoice?.group ?? groups.find(g =>
    (state.current?.provider && g.id === state.current.provider) ||
    g.models.some(m => m.id === state.current?.model)
  ) ?? groups[0]
  const { pending } = state
  const busy = pending !== null

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      // The portaled card is outside the trigger subtree; check both.
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  useLayoutEffect(() => {
    if (!showSearch) {
      setQuery('')
      setHighlightedIndex(null)
    }
  }, [showSearch])

  const paneFocus = useRef<'drill' | null>(null)
  const previousShowSearch = useRef(showSearch)
  useEffect(() => {
    const changedSearchMode = previousShowSearch.current !== showSearch
    previousShowSearch.current = showSearch
    const intent = paneFocus.current ?? (changedSearchMode ? 'drill' : null)
    paneFocus.current = null
    if (!open || intent === null) return
    if (intent === 'drill') {
      if (showSearch) {
        searchRef.current?.focus()
        return
      }
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      const target = checked ?? itemRefs.current.find(item => item !== null && !item.disabled)
      ;(target ?? triggerRef.current)?.focus()
    }
  }, [open, showSearch])

  useEffect(() => {
    const viewport = groupsRef.current
    if (viewport === null) return
    return observeStickyMenuGroups(viewport)
  }, [available, open, filteredGroups])

  useLayoutEffect(() => {
    if (open && activeModelIndex >= 0) {
      itemRefs.current[activeModelIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeModelIndex, visibleModels])

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
  }, [open, state, query])

  if (!available) return null

  const show = (): void => {
    setSelectionFocus(false)
    triggerRef.current?.focus()
    setQuery('')
    setHighlightedIndex(null)
    paneFocus.current = 'drill'
    setOpen(true)
    reload()
  }

  const changeQuery = (next: string): void => {
    setQuery(next)
    setHighlightedIndex(0)
  }

  const close = (restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const closeAfterSelection = (): void => {
    setSelectionFocus(true)
    close(true)
  }

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
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
      close(true)
      return
    }
    if (!open) return
    if (showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (!busy && visibleModels.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setHighlightedIndex((activeModelIndex + direction + visibleModels.length) % visibleModels.length)
        searchRef.current?.focus()
      }
      return
    }
    if (showSearch && event.target instanceof HTMLInputElement
      && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      if (event.key === 'Tab' && visibleModels.length === 0) return
      event.preventDefault()
      const highlighted = visibleModels[activeModelIndex]
      if (!busy && highlighted !== undefined) choose(highlighted)
      return
    }
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        close(true)
        return
      }
      const focused = document.activeElement
      const rows = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
      if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
        event.preventDefault()
        focused.click()
        return
      }
      if (focused !== triggerRef.current) return
      event.preventDefault()
      if (showSearch) {
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

  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      closeAfterSelection()
      return
    }
    submit(selection)
  }

  const waiting = state.current === null && state.status === 'loading'
  const activeConfigured = configuredModels.find(m => m.id === state.current?.model)
  const dualLabel = getDualModelLabel(activeGroup)
  const modelLabel = waiting
    ? t('trigger.loading')
    : (dualLabel ?? activeConfigured?.name ?? currentChoice?.model.name
      ?? (state.current === null ? t('trigger.fallback') : state.current.model))
  const triggerLabel = modelLabel
  const triggerAria = waiting
    ? t('trigger.loading')
    : state.current === null
      ? t('trigger.selectAria')
      : t('trigger.aria', { model: modelLabel })

  const handleOpenSettingsModels = (e: React.MouseEvent) => {
    e.stopPropagation()
    close()
    window.dispatchEvent(new CustomEvent('open-settings-section', { detail: 'models' }))
  }

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
        <span className={css.triggerLabel}>{modelLabel}</span>
        {busy
          ? <StateDot state="ongoing" />
          : <IconChevronDownOutlineRegular className={clsx(css.chevron, open && css.chevronOpen)} />}
      </button>

      <button
        type="button"
        className={css.editTriggerBtn}
        onClick={handleOpenSettingsModels}
        title={t('trigger.editAria')}
        aria-label={t('trigger.editAria')}
      >
        <EditIcon />
      </button>

      {open && createPortal(
        <MenuSurface
          ref={menuRef}
          id={`${id}-menu`}
          className={css.menu}
          style={menuPos ?? MEASURE_STYLE}
          role="menu"
          aria-label={t('menu.model')}
          aria-busy={state.status === 'loading' || busy}
        >
          {showSearch && (
            <div className={css.searchRow}>
              <Input
                ref={searchRef}
                className={clsx(css.search, query !== '' && css.searchWithQuery)}
                type="text"
                role="searchbox"
                aria-label={t('search.placeholder')}
                aria-controls={`${id}-models`}
                aria-activedescendant={activeModelIndex < 0 ? undefined : `${id}-model-${activeModelIndex}`}
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
            role="menu"
            aria-label={t('menu.model')}
            hidden={filteredGroups.length === 0}
          >
            {filteredGroups.map((group) => {
              return (
                <MenuGroup key={group.id} label={group.id === 'deepseek-account' ? t('provider.account') : group.name}>
                  {group.models.map((model) => {
                    const index = modelIndex++
                    const selected = state.current?.provider === group.id && state.current.model === model.id
                    return (
                      <button
                        ref={itemRef()}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        id={`${id}-model-${index}`}
                        tabIndex={showSearch ? -1 : 0}
                        onFocus={() => { setHighlightedIndex(index) }}
                        data-highlighted={index === activeModelIndex ? '' : undefined}
                        className={clsx(
                          css.option, css.modelOption, selected && css.selected, index === activeModelIndex && css.optionActive,
                        )}
                        onMouseMove={busy || index === activeModelIndex ? undefined : () => {
                          if (showSearch) setHighlightedIndex(index)
                          else itemRefs.current[index]?.focus()
                        }}
                        key={model.id}
                        title={model.name}
                        disabled={busy}
                        onClick={() => { choose({ provider: group.id, model: model.id }) }}
                      >
                        <span className={css.optionCopy}>
                          <span className={css.modelNameRow}>
                            <span className={css.modelName}>{model.name}</span>
                            {model.description && (
                              <span
                                className={clsx(
                                  css.modelBadge,
                                  model.description.toLowerCase().includes('reason')
                                    ? css.reasoningBadge
                                    : css.fastBadge,
                                )}
                              >
                                {model.description}
                              </span>
                            )}
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

          <div className={css.menuFooter}>
            <button
              type="button"
              className={css.editModelsButton}
              onClick={handleOpenSettingsModels}
            >
              <EditIcon />
              <span>{t('menu.editModels')}</span>
            </button>
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
