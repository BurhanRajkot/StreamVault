import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScrolled } from '@app/lib/hooks'
import { spring } from '@app/lib/motion'

/*
 * The app's building blocks, after iOS: a navigation bar that turns to frosted
 * glass once content slides under it, grouped lists with coloured icon tiles,
 * segmented controls, switches and capsule buttons. Screens compose these
 * rather than styling their own.
 */

// ── Navigation ──────────────────────────────────────────────────────────────

/** Back through the app's history, or to `fallback` when the screen was opened directly. */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate(fallback, { replace: true }))
}

/** A round frosted button — back, share, close — for bars and artwork. */
export function CircleButton({
  label,
  onClick,
  children,
  className,
  size = 'md',
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'glass-button press flex shrink-0 items-center justify-center rounded-full text-white',
        size === 'sm' ? 'h-[30px] w-[30px]' : size === 'lg' ? 'h-[50px] w-[50px]' : 'h-10 w-10',
        className
      )}
    >
      {children}
    </button>
  )
}

/**
 * The phone's navigation bar: clear at the top of the page, frosted glass
 * with the screen's title once the large title has scrolled under it. Over
 * artwork (`overlay`) it stays clear for longer.
 */
export function NavBar({
  title,
  back,
  backTo = '/',
  actions,
  threshold = 44,
}: {
  title: string
  back?: boolean
  backTo?: string
  actions?: ReactNode
  threshold?: number
}) {
  const scrolled = useScrolled(threshold)
  const goBack = useBack(backTo)
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-30 pt-[var(--sat)] transition-[background-color,box-shadow,backdrop-filter] duration-300 lg:hidden',
        scrolled ? 'material-bar' : 'bg-transparent'
      )}
    >
      <div className="relative flex h-[var(--navbar-h)] items-center gap-2 px-3">
        {back && (
          <CircleButton label="Back" onClick={goBack}>
            <ChevronLeft className="-ml-0.5 h-[22px] w-[22px]" strokeWidth={2.4} />
          </CircleButton>
        )}
        <motion.p
          initial={false}
          animate={{ opacity: scrolled ? 1 : 0, y: scrolled ? 0 : 6 }}
          transition={{ duration: 0.2 }}
          className="t-headline pointer-events-none absolute inset-x-16 truncate text-center"
          aria-hidden={!scrolled}
        >
          {title}
        </motion.p>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </div>
  )
}

/** A screen's large title, as on iOS: the nav bar takes it over as it scrolls away. */
export function LargeTitle({ title, subtitle, actions, className }: { title: string; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-5 flex items-end gap-3 lg:mb-8', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="t-large lg:text-[40px] lg:leading-[48px]">{title}</h1>
        {subtitle && <p className="t-subhead mt-1 text-label-2">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

// ── Grouped lists ───────────────────────────────────────────────────────────

/** A section of an inset grouped list: an optional header, the cells, an optional footer. */
export function ListSection({ header, footer, children, className }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-7', className)}>
      {header && <h2 className="t-footnote mb-1.5 px-4 uppercase tracking-[0.02em] text-label-2">{header}</h2>}
      <div className="overflow-hidden rounded-[12px] bg-grouped">{children}</div>
      {footer && <p className="t-footnote mt-1.5 px-4 text-label-2">{footer}</p>}
    </section>
  )
}

const TILE_COLORS = {
  blue: 'bg-tint',
  green: 'bg-ios-green',
  red: 'bg-ios-red',
  orange: 'bg-ios-orange',
  yellow: 'bg-ios-yellow text-black',
  pink: 'bg-ios-pink',
  indigo: 'bg-ios-indigo',
  teal: 'bg-ios-teal',
  gray: 'bg-ios-gray',
  graphite: 'bg-[#3a3a3c]',
} as const

export type TileColor = keyof typeof TILE_COLORS

/** The rounded coloured square an iOS settings row carries its glyph in. */
export function IconTile({ color, children, className }: { color: TileColor; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white [&>svg]:h-[18px] [&>svg]:w-[18px]', TILE_COLORS[color], className)}>
      {children}
    </span>
  )
}

/**
 * One cell of a grouped list. It's a link with `to`, a button with
 * `onClick`, plain otherwise. Its separator starts where the label does.
 */
export function ListRow({
  to,
  onClick,
  icon,
  label,
  detail,
  value,
  accessory = to || onClick ? 'chevron' : 'none',
  trailing,
  destructive,
  tint,
  center,
  className,
  disabled,
}: {
  to?: string
  onClick?: () => void
  icon?: ReactNode
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  accessory?: 'chevron' | 'check' | 'none'
  trailing?: ReactNode
  destructive?: boolean
  tint?: boolean
  center?: boolean
  className?: string
  disabled?: boolean
}) {
  const inner = (
    <>
      {icon}
      <span className={cn('min-w-0 flex-1', center && 'text-center')}>
        <span className={cn('t-body block truncate', destructive && 'text-ios-red', tint && 'text-tint')}>{label}</span>
        {detail && <span className="t-footnote mt-0.5 block text-label-2">{detail}</span>}
      </span>
      {value !== undefined && value !== null && <span className="t-body max-w-[48%] shrink-0 truncate text-label-2">{value}</span>}
      {trailing}
      {accessory === 'chevron' && <ChevronRight className="-mr-1 h-[18px] w-[18px] shrink-0 text-label-3" strokeWidth={2.4} />}
      {accessory === 'check' && <Check className="h-5 w-5 shrink-0 text-tint" strokeWidth={2.6} />}
    </>
  )
  const cls = cn(
    'cell-sep-inset relative flex min-h-[50px] w-full items-center gap-3 px-4 py-2.5 text-left',
    (to || onClick) && !disabled && 'tap',
    disabled && 'opacity-50',
    className
  )
  const style = { '--sep-inset': icon ? '58px' : '16px' } as React.CSSProperties
  if (to)
    return (
      <Link to={to} className={cls} style={style}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style}>
        {inner}
      </button>
    )
  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
}

// ── Controls ────────────────────────────────────────────────────────────────

/** iOS's segmented control: a gray track, a lighter thumb that slides to the choice. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className,
  size = 'md',
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  layoutId: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={cn('relative z-0 flex rounded-[9px] bg-fill p-[2px]', className)}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative flex-1 whitespace-nowrap rounded-[7px] font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-[3px] text-[13px]' : 'px-3 py-[6px] text-[13.5px]',
              active ? 'text-white' : 'text-white/75'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className="absolute inset-0 -z-10 rounded-[7px] bg-[#636366] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]"
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** iOS's switch: green when on. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200', checked ? 'justify-end bg-ios-green' : 'justify-start bg-[rgb(120_120_128/0.32)]')}
    >
      <motion.span layout transition={spring} className="h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)]" />
    </button>
  )
}

type ButtonVariant = 'primary' | 'tinted' | 'gray' | 'glass'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black',
  tinted: 'bg-tint text-white',
  gray: 'bg-fill text-white',
  glass: 'glass-button text-white',
}

const BUTTON_SIZES = {
  lg: 'h-[50px] px-6 text-[17px] gap-2 [&>svg]:h-5 [&>svg]:w-5',
  md: 'h-11 px-5 text-[15px] gap-1.5 [&>svg]:h-[18px] [&>svg]:w-[18px]',
  sm: 'h-[30px] px-3.5 text-[13px] gap-1 [&>svg]:h-3.5 [&>svg]:w-3.5',
} as const

/** A capsule button: white for the main action, tinted, gray or frosted for the rest. */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof BUTTON_SIZES }) {
  return (
    <button
      type="button"
      {...props}
      className={cn('press inline-flex shrink-0 items-center justify-center rounded-full font-semibold disabled:opacity-50', BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    >
      {children}
    </button>
  )
}

/** Same as Button, for a route. */
export function ButtonLink({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: ButtonVariant; size?: keyof typeof BUTTON_SIZES; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn('press inline-flex shrink-0 items-center justify-center rounded-full font-semibold', BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
      {children}
    </Link>
  )
}

/** An empty screen: a glyph, a title, a line and an action — iOS's ContentUnavailableView. */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 pt-16 text-center lg:pt-24">
      <span className="mb-4 text-label-2 [&>svg]:h-14 [&>svg]:w-14 [&>svg]:stroke-[1.5]">{icon}</span>
      <p className="t-title2">{title}</p>
      <p className="t-subhead mt-1.5 max-w-sm text-label-2">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
