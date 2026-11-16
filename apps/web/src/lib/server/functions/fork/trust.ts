import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { PERMISSIONS } from '@/lib/shared/permissions'
import {
  trustConfigSchema,
  trustItemInputSchema,
  trustItemRefSchema,
  trustReorderSchema,
} from '@/lib/shared/fork/trust/schema'
import { actorFromAuth } from '@/lib/server/audit/log'
import {
  deleteTrustItem,
  getTrustAdminData,
  reorderTrustItems,
  saveTrustItem,
  setTrustEnabled,
  updateTrustConfig,
  type TrustWriter,
} from '@/lib/server/fork/trust/trust.service'
import { requireAuth, type AuthContext } from '../auth-helpers'

/**
 * Admin server functions for the Trust & Security page
 * (plans/v2/70-trust-security.md §7). Reads need `trust.view`, edits
 * `trust.manage`; turning the page on or off is a workspace setting
 * (`settings.manage`).
 */

function writerFrom(auth: AuthContext): TrustWriter {
  return {
    principalId: auth.principal.id,
    audit: actorFromAuth(auth),
    headers: getRequestHeaders(),
  }
}

/** Everything the admin page shows, in one read. */
export const getTrustAdminFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAuth({ permission: PERMISSIONS.TRUST_VIEW })
  return getTrustAdminData()
})

export const saveTrustItemFn = createServerFn({ method: 'POST' })
  .validator(trustItemInputSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.TRUST_MANAGE })
    await saveTrustItem(writerFrom(auth), data)
  })

export const deleteTrustItemFn = createServerFn({ method: 'POST' })
  .validator(trustItemRefSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.TRUST_MANAGE })
    await deleteTrustItem(writerFrom(auth), data.entity, data.id)
  })

export const reorderTrustItemsFn = createServerFn({ method: 'POST' })
  .validator(trustReorderSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.TRUST_MANAGE })
    await reorderTrustItems(writerFrom(auth), data.entity, data.ids)
  })

export const updateTrustConfigFn = createServerFn({ method: 'POST' })
  .validator(trustConfigSchema)
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.TRUST_MANAGE })
    return updateTrustConfig(writerFrom(auth), data)
  })

export const setTrustEnabledFn = createServerFn({ method: 'POST' })
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const auth = await requireAuth({ permission: PERMISSIONS.SETTINGS_MANAGE })
    return setTrustEnabled(writerFrom(auth), data.enabled)
  })
