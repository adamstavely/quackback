import { useRef, useState, type ReactElement } from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { StarIcon, CheckIcon } from '@heroicons/react/24/solid'
import { StarIcon as OutlineStarIcon } from '@heroicons/react/24/outline'
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
 * foreground outline, and the recorded score is announced through a live region
 * rather than being conveyed by fill colour alone (SC 1.4.1).
 */
export function HubRating({ conversationId, value, onRate }: HubRatingProps): ReactElement {
  const intl = useIntl()
  const [score, setScore] = useState<number | null>(value ?? null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [selected, setSelected] = useState<number | null>(value ?? null)
  const [error, setError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const submit = async () => {
    if (selected === null || pending) return
    setPending(true)
    setError(false)
    try {
      await onRate(selected)
      const restoreFocus =
        document.activeElement === document.body ||
        rootRef.current?.contains(document.activeElement)
      setScore(selected)
      if (restoreFocus)
        requestAnimationFrame(() =>
          resultRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
        )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  const groupLabel = intl.formatMessage({
    id: 'portal.forkHub.rating.label',
    defaultMessage: 'How did we do, from 1 (not great) to 5 (excellent)?',
  })

  const content =
    score !== null ? (
      <div
        ref={resultRef}
        tabIndex={-1}
        className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-current"
      >
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
          className="min-h-6 p-0 text-xs text-foreground underline"
          onClick={() => {
            setScore(null)
            requestAnimationFrame(() =>
              groupRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus()
            )
          }}
        >
          <FormattedMessage id="portal.forkHub.rating.change" defaultMessage="Change" />
        </Button>
      </div>
    ) : (
      <div className="flex flex-col items-start gap-2">
        <RadioGroup
          ref={groupRef}
          value={selected === null ? null : String(selected)}
          aria-label={groupLabel}
          disabled={pending}
          className="flex flex-wrap items-center gap-0.5"
          onMouseLeave={() => setHovered(null)}
          onValueChange={(next) => setSelected(Number(next))}
        >
          {SCORES.map((item) => {
            const filled = item <= (hovered ?? selected ?? 0)
            const RatingIcon = filled ? StarIcon : OutlineStarIcon
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
                  'focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2',
                  'disabled:pointer-events-none disabled:opacity-50'
                )}
              >
                <RatingIcon
                  aria-hidden
                  className={cn(
                    'size-[18px] transition-colors',
                    filled ? 'text-foreground' : 'text-muted-foreground'
                  )}
                />
              </Radio.Root>
            )
          })}
        </RadioGroup>
        <Button
          type="button"
          size="sm"
          disabled={pending || selected === null}
          onClick={() => void submit()}
        >
          <FormattedMessage id="portal.forkHub.rating.submit" defaultMessage="Submit rating" />
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not save your rating. Please try again.
          </p>
        ) : null}
      </div>
    )
  return (
    <div ref={rootRef}>
      <span role="status" className="sr-only">
        {score !== null ? `Rated ${score} of 5` : pending ? 'Saving rating' : ''}
      </span>
      {content}
    </div>
  )
}
