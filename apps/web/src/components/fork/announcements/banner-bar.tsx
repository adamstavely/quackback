import type { ReactElement } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { useLocalDateFormatter } from '@/components/ui/local-date'
import { KIND_PRESETS } from '@/lib/shared/fork/announcements/presets'
import type { BannerItem } from '@/lib/shared/fork/announcements/types'
import { cn } from '@/lib/shared/utils'
import { KIND_STYLES } from './kind-styles'

interface BannerBarProps {
  item: Pick<BannerItem, 'kind' | 'title' | 'body' | 'link' | 'window'>
  /**
   * Live-region semantics from the kind's preset: an incident is an alert, the
   * rest are polite status messages (SC 4.1.3). Off for previews, so editing
   * a draft does not announce every keystroke.
   */
  announce?: boolean
  /** Every banner is dismissible (D-N9); previews leave this out. */
  onDismiss?: () => void
  className?: string
}

/**
 * One banner, one layout for every kind: icon, bold title, text, an optional
 * link and a dismiss button. Only the colour and icon change with the kind.
 */
export function BannerBar({
  item,
  announce = true,
  onDismiss,
  className,
}: BannerBarProps): ReactElement {
  const preset = KIND_PRESETS[item.kind]
  const style = KIND_STYLES[item.kind]
  const Icon = style.icon
  const formatDate = useLocalDateFormatter()
  const windowText = item.window ? formatWindow(item.window, formatDate) : null

  return (
    <div
      role={announce ? preset.role : undefined}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm text-foreground',
        style.surface,
        className
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', style.iconColor)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-x-4">
        <p className="min-w-0 sm:flex-1">
          {/* The kind in words, so it never rests on colour or icon alone (SC 1.4.1). */}
          <span className="sr-only">{preset.label}: </span>
          <span className="font-semibold">{item.title}</span>
          {windowText ? <span> {windowText}</span> : null}
          {item.body ? <span> {item.body}</span> : null}
        </p>
        {item.link ? (
          <a
            href={item.link.url}
            className="shrink-0 rounded-sm font-medium underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.link.label}
          </a>
        ) : null}
      </div>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-my-1 -mr-2 shrink-0 text-foreground hover:bg-foreground/10"
          aria-label={`Dismiss: ${item.title}`}
          onClick={onDismiss}
        >
          <XMarkIcon aria-hidden className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

const WINDOW_START: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}
const WINDOW_END_SAME_DAY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

/** "Oct 12, 2:00 AM – 4:00 AM", or the full end date when it falls on another day. */
function formatWindow(
  span: NonNullable<BannerItem['window']>,
  formatDate: ReturnType<typeof useLocalDateFormatter>
): string {
  const start = new Date(span.start)
  const startText = formatDate(start, WINDOW_START)
  if (!span.end) return startText
  const end = new Date(span.end)
  const sameDay = start.toDateString() === end.toDateString()
  return `${startText} – ${formatDate(end, sameDay ? WINDOW_END_SAME_DAY : WINDOW_START)}`
}
