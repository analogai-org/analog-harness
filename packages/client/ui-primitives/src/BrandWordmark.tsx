import type { IconProps } from './icons/props.ts'

/** Display options for the official brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading whale mark; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24; width follows the selected artwork).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading whale mark.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: BrandWordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        fontWeight: 'bold',
        fontFamily: 'sans-serif',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        color: 'currentColor',
      }}
      aria-hidden="true"
    >
      AnalogAI
    </span>
  )
}
