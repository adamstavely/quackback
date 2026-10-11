import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AnnouncementsAdmin } from '@/components/fork/announcements/admin/announcements-admin'

export const ANNOUNCEMENT_VIEWS = [
  'live',
  'scheduled',
  'drafts',
  'all',
  'archived',
  'templates',
  'settings',
] as const

const searchSchema = z.object({
  view: z.enum(ANNOUNCEMENT_VIEWS).optional(),
  /** The editor: `new`, or the id of the announcement being edited. */
  edit: z.string().optional(),
})

export const Route = createFileRoute('/admin/announcements')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: 'Announcements' }] }),
  component: AnnouncementsPage,
})

function AnnouncementsPage() {
  return (
    <div className="h-full">
      <AnnouncementsAdmin />
    </div>
  )
}
