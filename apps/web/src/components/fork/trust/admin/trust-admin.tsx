import type { ComponentType, ReactElement, ReactNode, SVGProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  BuildingOffice2Icon,
  CheckBadgeIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  KeyIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/solid'
import { AdminFilterLayout } from '@/components/admin/admin-filter-layout'
import { FilterSection } from '@/components/shared/filter-section'
import { MENU_ICON, MENU_ROW } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/lib/client/hooks/use-permission'
import { trustQueries } from '@/lib/client/fork/trust'
import { PERMISSIONS } from '@/lib/shared/permissions'
import { cn } from '@/lib/shared/utils'
import { Route, type TRUST_VIEWS } from '@/routes/admin/trust'
import { TrustAccessView } from './trust-access-view'
import { TrustSettingsView } from './trust-settings-view'
import { TrustUpdatesView } from './trust-updates-view'
import { ComplianceView, ControlsView, DocumentsView, SubprocessorsView } from './trust-views'

type View = (typeof TRUST_VIEWS)[number]

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

/**
 * Admin home for the Trust & Security page (plans/v2/70-trust-security.md §7).
 * Reading needs `trust.view`; every control that writes is shown only to
 * `trust.manage`, and the server checks both.
 */
export function TrustAdmin(): ReactElement {
  const search = Route.useSearch()
  const view: View = search.view ?? 'settings'
  const canView = usePermission(PERMISSIONS.TRUST_VIEW)
  const canManage = usePermission(PERMISSIONS.TRUST_MANAGE)
  const { data, isLoading } = useQuery({ ...trustQueries.admin(), enabled: canView })
  const { data: requests } = useQuery({ ...trustQueries.accessRequests(), enabled: canView })
  const pendingRequests = requests?.filter((r) => r.state === 'pending').length

  if (!canView) {
    return (
      <AdminFilterLayout headerTitle="Trust & Security" filters={null}>
        <p className="p-6 text-sm text-muted-foreground">
          You don’t have access to the Trust & Security page. Ask a workspace admin for the Trust &
          Security permission.
        </p>
      </AdminFilterLayout>
    )
  }

  const nav = (
    <nav aria-label="Trust & Security views" className="flex h-full flex-col">
      <FilterSection title="Page">
        <div className="space-y-1">
          <NavItem view="settings" current={view} icon={Cog6ToothIcon}>
            Settings
          </NavItem>
        </div>
      </FilterSection>
      <FilterSection title="Content">
        <div className="space-y-1">
          <NavItem
            view="compliance"
            current={view}
            icon={CheckBadgeIcon}
            count={data?.complianceItems.length}
          >
            Compliance
          </NavItem>
          <NavItem
            view="documents"
            current={view}
            icon={DocumentTextIcon}
            count={data?.documents.length}
          >
            Documents
          </NavItem>
          <NavItem
            view="controls"
            current={view}
            icon={ShieldCheckIcon}
            count={data?.controls.length}
          >
            Controls
          </NavItem>
          <NavItem
            view="subprocessors"
            current={view}
            icon={BuildingOffice2Icon}
            count={data?.subprocessors.length}
          >
            Subprocessors
          </NavItem>
          <NavItem view="updates" current={view} icon={MegaphoneIcon}>
            Updates
          </NavItem>
        </div>
      </FilterSection>
      <FilterSection title="Requests">
        <div className="space-y-1">
          <NavItem view="access" current={view} icon={KeyIcon} count={pendingRequests}>
            Access requests
          </NavItem>
        </div>
      </FilterSection>
    </nav>
  )

  return (
    <AdminFilterLayout headerTitle="Trust & Security" filters={nav}>
      <div className="flex w-full max-w-5xl flex-1 flex-col gap-4">
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full rounded-panel" />
        ) : (
          <>
            {view === 'settings' ? (
              <TrustSettingsView
                enabled={data.enabled}
                config={data.config}
                categories={data.helpCenterCategories}
                canManage={canManage}
              />
            ) : null}
            {view === 'compliance' ? <ComplianceView data={data} canManage={canManage} /> : null}
            {view === 'documents' ? <DocumentsView data={data} canManage={canManage} /> : null}
            {view === 'controls' ? <ControlsView data={data} canManage={canManage} /> : null}
            {view === 'updates' ? <TrustUpdatesView canManage={canManage} /> : null}
            {view === 'access' ? <TrustAccessView grantDays={data.config.grantDays} /> : null}
            {view === 'subprocessors' ? (
              <SubprocessorsView data={data} canManage={canManage} />
            ) : null}
          </>
        )}
      </div>
    </AdminFilterLayout>
  )
}
