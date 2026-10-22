import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type BadgeTone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral'

const toneCls: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  danger: 'bg-danger-soft text-alfa',
  neutral: 'bg-canvas text-muted',
}

export function Badge({
  tone = 'neutral',
  children,
  dot,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        toneCls[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-alfa/25 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'h-9 px-3.5 text-[13px]',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-14 px-7 text-[15px]',
        variant === 'primary' && 'bg-alfa text-white hover:bg-alfa-dark',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-canvas',
        variant === 'ghost' && 'text-ink hover:bg-canvas',
        variant === 'dark' && 'bg-ink text-white hover:bg-ink/90',
        className,
      )}
    >
      {children}
    </button>
  )
}
