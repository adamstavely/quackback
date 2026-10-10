import type { ComponentType, SVGProps } from 'react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid'
import type { AnnouncementKind } from '@/lib/shared/fork/announcements/types'

/**
 * How each kind is drawn. A fixed semantic ramp, like upstream's status page
 * (`components/portal/status/status-colors.ts`), so a kind reads the same in
 * every workspace: the platform's `destructive`, `warning` and `success` tokens,
 * and the same blue and violet the platform uses for informational and
 * maintenance states. The icon carries the meaning too, so colour is never the
 * only cue (SC 1.4.1).
 */
export interface KindStyle {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Tinted surface and border for the banner. */
  surface: string
  /** The icon's colour; meets 3:1 against the tinted surface (SC 1.4.11). */
  iconColor: string
}

export const KIND_STYLES: Record<AnnouncementKind, KindStyle> = {
  critical: {
    icon: XCircleIcon,
    surface: 'border-destructive/35 bg-destructive/10',
    iconColor: 'text-destructive',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    surface: 'border-warning/40 bg-warning/10',
    iconColor: 'text-warning',
  },
  maintenance: {
    icon: WrenchScrewdriverIcon,
    surface: 'border-violet-500/35 bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  info: {
    icon: InformationCircleIcon,
    surface: 'border-blue-500/35 bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    icon: CheckCircleIcon,
    surface: 'border-success/35 bg-success/10',
    iconColor: 'text-success',
  },
}
