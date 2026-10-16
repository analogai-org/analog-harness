import { Tooltip, IconSlidersTwoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import clsx from 'clsx'
import css from './DashboardAction.module.css'

export function DashboardAction({ wide }: SidebarFooterActionOwnerProps) {
  return (
    <Tooltip label="Dashboard" delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.actionButton, wide && css.wide)}
        aria-label="Dashboard"
        onClick={() => {
          window.open('http://localhost:8071/agents', '_blank')
        }}
      >
        <span className={css.actionGlyph} aria-hidden="true">
          <IconSlidersTwoOutlineRegular size={wide ? 16 : 18} />
        </span>
        {wide && (
          <span className={css.actionTitle}>
            Dashboard
          </span>
        )}
      </button>
    </Tooltip>
  )
}
