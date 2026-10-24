/** Sidebar account launcher and locally authoritative sign-out action. */
import { useEffect, useRef, useState } from 'react'
import {
  Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineMedium, IconSettingsOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import { AccountNoticeCard } from './AccountNotice.tsx'
import css from './AccountMenu.module.css'

/** Account launcher composed by the settings shell. */
export function AccountMenu({
  account, settingsShortcut, colorScheme,
  contactUs, openSettings, openOnboarding, showLogin,
  start, cancel, t,
}: {
  account: InjectFace<AccountSectionInjected>
  settingsShortcut?: string
  contactUs: () => void
  openSettings: () => void
  openOnboarding: (preferredProvider?: string) => void
  showLogin: (visible: boolean) => void
} & PropsRuntime & PropsLocale) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, [open])

  return <div className={css.accountMenu}>
    <button ref={trigger}
      className={css.launcher}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={t('accountSettings')}
      onClick={() => { setOpen((value) => !value) }}>
      <AccountAvatar user={account.user} size={32} />
      <span className={css.username}>{account.user?.name ?? t('guest')}</span>
      <IconEllipsisOutlineMedium size={16} className={css.ellipsis} />
    </button>
    <Menu open={open}
      triggerRef={trigger}
      direction="up"
      header={<div className={css.menuHeader}>
        <AccountAvatar user={account.user} size={48} />
        <div className={css.menuUserInfo}>
          <div className={css.menuUsername}>{account.user?.name ?? t('guest')}</div>
          {account.user?.email && <div className={css.menuEmail}>{account.user.email}</div>}
        </div>
      </div>}
      notices={<AccountNoticeCard user={account.user} t={t} />}
      items={[
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        { id: 'contact', label: t('contactUs'), icon: <IconPaperPlaneOutlineMedium size={16} /> },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
        else if (id === 'contact') { setOpen(false); contactUs() }
      }} />
    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}
      start={start} cancel={cancel} t={t}
      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}
  </div>
}
