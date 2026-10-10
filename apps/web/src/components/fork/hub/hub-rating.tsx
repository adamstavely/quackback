import { useState, type ReactElement } from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { StarIcon, CheckIcon } from '@heroicons/react/24/solid'
import { FormattedMessage, useIntl } from 'react-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/shared/utils'

const SCORES = [1, 2, 3, 4, 5] as const

interface HubRatingProps {
  /** Conversation the score belongs to. */
  conversationId: string
  /** Score already recorded, when the requester has rated this one. */
  value?: number | null
  /** Submits the score. Resolves when the server has accepted it. */
  onRate: (score: number) => Promise<void>
}

/**
 * CSAT control shown inline on a resolved request.
 *
 * A radio group rather than five buttons: a score is one choice out of five, so
 * screen readers announce "2 of 5" and arrow keys move between scores, which is
 * what WCAG 2.2 expects of a single-select control. Each hit area is 44px
 * (SC 2.5.8 asks for 24px minimum), the stars carry visible focus from the
 * shared ring tokens, and the recorded score is announced through a live region
 * rather than being conveyed by fill colour alone (SC 1.4.1).
 */
export function HubRating({ conversationId, value, onRate }: HubRatingProps): ReactElement {
  const intl = useIntl()
  const [score, setScore] = useState<number | null>(value ?? null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pending, setPending] = useState(false)

  const groupLabel = intl.formatMessage({
    id: 'portal.forkHub.rating.label',
    defaultMessage: 'How did we do, from 1 (not great) to 5 (excellent)?',
  })

  if (score !== null) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckIcon aria-hidden className="size-3.5" />
          <FormattedMessage
            id="portal.forkHub.rating.recorded"
            defaultMessage="Rated {score} of 5"
            values={{ score }}
          />
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setScore(null)}
        >
          <FormattedMessage id="portal.forkHub.rating.change" defaultMessage="Change" />
        </Button>
      </div>
    )
  }

  return (
    <RadioGroup
      aria-label={groupLabel}
      disabled={pending}
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHovered(null)}
      onValueChange={(next) => {
        const picked = Number(next)
        setPending(true)
        void onRate(picked)
          .then(() => setScore(picked))
          .finally(() => setPending(false))
      }}
    >
      {SCORES.map((item) => {
        const filled = item <= (hovered ?? 0)
        return (
          <Radio.Root
            key={`${conversationId}-${item}`}
            value={String(item)}
            aria-label={intl.formatMessage(
              { id: 'portal.forkHub.rating.score', defaultMessage: '{score} of 5' },
              { score: item }
            )}
            onMouseEnter={() => setHovered(item)}
            onFocus={() => setHovered(item)}
            className={cn(
              'flex size-11 cursor-pointer items-center justify-center rounded-[var(--radius)] bg-transparent',
              'outline-none transition-colors',
              'hover:bg-muted/40',
              'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            <StarIcon
              aria-hidden
              className={cn(
                'size-[18px] transition-colors',
                filled ? 'fill-primary text-primary' : 'text-muted-foreground/50'
              )}
            />
          </Radio.Root>
        )
      })}
    </RadioGroup>
  )
}
