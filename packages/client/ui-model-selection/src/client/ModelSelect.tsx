import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'

export interface ModelSelectProps extends PropsLocale<'model'>, ModelSelectInjected {
  locked?: boolean
}

export function ModelSelect(_props: ModelSelectProps): React.ReactNode {
  return null
}
