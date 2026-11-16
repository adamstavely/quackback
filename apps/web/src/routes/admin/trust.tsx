import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TrustAdmin } from '@/components/fork/trust/admin/trust-admin'

export const TRUST_VIEWS = [
  'settings',
  'compliance',
  'documents',
  'controls',
  'subprocessors',
  'access',
] as const

const searchSchema = z.object({
  view: z.enum(TRUST_VIEWS).optional(),
})

export const Route = createFileRoute('/admin/trust')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: 'Trust & Security' }] }),
  component: TrustPage,
})

function TrustPage() {
  return (
    <div className="h-full">
      <TrustAdmin />
    </div>
  )
}
