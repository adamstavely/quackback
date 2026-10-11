import type { ComponentType, ReactElement, ReactNode, SVGProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArchiveBoxIcon,
  CalendarIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  SpeakerWaveIcon,
  PencilSquareIcon,
  QueueListIcon,
} from '@heroicons/react/24/solid'
import { AdminFilterLayout } from '@/components/admin/admin-filter-layout'
import { FilterSection } from '@/components/shared/filter-section'
import { MENU_ICON, MENU_ROW } from '@/components/ui/menu'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { announcementQueries } from '@/lib/client/fork/announcements'
import { announcementState } from '@/lib/shared/fork/announcements/visibility'
import type { Announcement, AnnouncementState } from '@/lib/shared/fork/announcements/types'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import { Route, type ANNOUNCEMENT_VIEWS } from '@/routes/admin/announcements'
import { AnnouncementEditor } from './announcement-editor'
import { AnnouncementList } from './announcement-list'
import { AnnouncementsOffNotice } from './announcements-off-notice'
import { AnnouncementSettingsView } from './announcement-settings-view'
import { AnnouncementTemplatesView } from './announcement-templates-view'

type View = (typeof ANNOUNCEMENT_VIEWS)[number]

/** Which derived states each list view shows. */
const VIEW_STATES: Partial<Record<View, AnnouncementState[]>> = {
  live: ['live'],
  scheduled: ['scheduled'],
  drafts: ['draft'],
  all: ['live', 'scheduled', 'draft', 'expired'],
  archived: ['archived'],
}

const VIEW_COPY: Record<View, { title: string; empty: string }> = {
  live: { title: 'Live', empty: 'Nothing is showing right now.' },
  scheduled: { title: 'Scheduled', empty: 'Nothing is scheduled.' },
  drafts: { title: 'Drafts', empty: 'No drafts.' },
  all: { title: 'All announcements', empty: 'No announcements yet.' },
  archived: { title: 'Archived', empty: 'Nothing archived.' },
  templates: { title: 'Templates', empty: '' },
  settings: { title: 'Settings', empty: '' },
}

function NavItem({
  view,
  current,
  icon: Icon,
  count,
  children,
}: {
  view: View
  current: View
  icon: ComponentType<SVGProps<SVGSVGElement>>
  count?: number
  children: ReactNode
}): ReactElement {
  const navigate = useNavigate({ from: Route.fullPath })
  const active = view === current
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => void navigate({ search: { view } })}
      className={cn(
        MENU_ROW,
        'w-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <Icon aria-hidden className={MENU_ICON} />
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      {count !== undefined ? (
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </button>
  )
}

function AnnouncementsNav({
  view,
  counts,
}: {
  view: View
  counts: Partial<Record<AnnouncementState, number>>
}): ReactElement {
  return (
    <nav aria-label="Announcement views" className="flex h-full flex-col">
      <FilterSection title="Announcements">
        <div className="space-y-1">
          <NavItem view="live" current={view} icon={SpeakerWaveIcon} count={counts.live}>
            Live
          </NavItem>
          <NavItem view="scheduled" current={view} icon={CalendarIcon} count={counts.scheduled}>
            Scheduled
          </NavItem>
          <NavItem view="drafts" current={view} icon={PencilSquareIcon} count={counts.draft}>
            Drafts
          </NavItem>
          <NavItem view="all" current={view} icon={QueueListIcon}>
            All
          </NavItem>
          <NavItem view="archived" current={view} icon={ArchiveBoxIcon}>
            Archived
          </NavItem>
        </div>
      </FilterSection>
      <FilterSection title="Manage">
        <div className="space-y-1">
          <NavItem view="templates" current={view} icon={DocumentDuplicateIcon}>
            Templates
          </NavItem>
          <NavItem view="settings" current={view} icon={Cog6ToothIcon}>
            Settings
          </NavItem>
        </div>
      </FilterSection>
    </nav>
  )
}

/**
 * Admin home for announcement banners: what is live, scheduled, drafted or
 * archived, the templates authors start from, and the workspace settings.
 * Mirrors the Status admin's layout. Reading needs `announcement.view`;
 * every control that writes is shown only to `announcement.manage`.
 */
export function AnnouncementsAdmin(): ReactElement {
  const search = Route.useSearch()
  const view: View = search.view ?? 'live'
  const canView = usePermission(PERMISSIONS.ANNOUNCEMENT_VIEW)
  const { data, isLoading } = useQuery({ ...announcementQueries.admin(), enabled: canView })

  if (!canView) {
    return (
      <AdminFilterLayout headerTitle="Announcements" filters={null}>
        <p className="p-6 text-sm text-muted-foreground">
          You don’t have access to announcements. Ask a workspace admin for the Announcements
          permission.
        </p>
      </AdminFilterLayout>
    )
  }

  const now = new Date()
  const announcements: Announcement[] = data?.announcements ?? []
  const counts: Partial<Record<AnnouncementState, number>> = {}
  for (const a of announcements) {
    const state = announcementState(a, now)
    counts[state] = (counts[state] ?? 0) + 1
  }
  const states = VIEW_STATES[view]
  const editing =
    search.edit === 'new' ? null : (announcements.find((a) => a.id === search.edit) ?? undefined)

  return (
    <>
      <AdminFilterLayout
        headerTitle="Announcements"
        filters={<AnnouncementsNav view={view} counts={counts} />}
      >
        <div className="flex w-full max-w-5xl flex-1 flex-col gap-4">
          {data && !data.enabled ? <AnnouncementsOffNotice /> : null}
          {states ? (
            <AnnouncementList
              title={VIEW_COPY[view].title}
              emptyMessage={VIEW_COPY[view].empty}
              isLoading={isLoading}
              announcements={announcements.filter((a) =>
                states.includes(announcementState(a, now))
              )}
            />
          ) : null}
          {view === 'templates' && data ? (
            <AnnouncementTemplatesView templates={data.templates} />
          ) : null}
          {view === 'settings' && data ? (
            <AnnouncementSettingsView enabled={data.enabled} config={data.config} />
          ) : null}
        </div>
      </AdminFilterLayout>

      {search.edit !== undefined && data && editing !== undefined ? (
        <AnnouncementEditor announcement={editing} templates={data.templates} />
      ) : null}
    </>
  )
}
