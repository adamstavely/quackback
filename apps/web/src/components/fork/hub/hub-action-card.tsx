import type { ComponentType, ReactElement, SVGProps } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface HubActionCardProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
  cta: string
  /** Internal destination, e.g. `/changelog`. */
  to: string
  /** The hub's single filled action; the rest are outlined. */
  primary?: boolean
}

/**
 * One of the hub's action cards (start a chat, release notes, roadmap).
 *
 * The icon is decorative and the card has no click handler of its own, so the
 * only focus stop is the button: one tab stop per card, with its accessible
 * name in the button text rather than in surrounding markup.
 */
export function HubActionCard({
  icon: Icon,
  title,
  description,
  cta,
  to,
  primary = false,
}: HubActionCardProps): ReactElement {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10">
          <Icon aria-hidden className="size-6 text-primary" />
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-base font-semibold text-foreground">{title}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{description}</span>
        </span>
        <Button asChild variant={primary ? 'default' : 'outline'} className="shrink-0">
          <Link to={to}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
