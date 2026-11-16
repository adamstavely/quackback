import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteTrustItemFn,
  getTrustAdminFn,
  reorderTrustItemsFn,
  saveTrustItemFn,
  setTrustEnabledFn,
  updateTrustConfigFn,
} from '@/lib/server/functions/fork/trust'
import { getTrustPageFn } from '@/lib/server/functions/fork/trust-portal'

export const trustKeys = {
  admin: () => ['fork', 'trust', 'admin'] as const,
  page: () => ['fork', 'trust', 'page'] as const,
}

export const trustQueries = {
  admin: () =>
    queryOptions({
      queryKey: trustKeys.admin(),
      queryFn: () => getTrustAdminFn(),
      staleTime: 15 * 1000,
    }),
  /** The portal page; read by the route loader, then shared by every tab. */
  page: () =>
    queryOptions({
      queryKey: trustKeys.page(),
      queryFn: () => getTrustPageFn(),
      staleTime: 60 * 1000,
    }),
}

/** Every write changes what the admin page shows, so each one refreshes it. */
function useTrustWrite<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: trustKeys.admin() }),
  })
}

type DataOf<F extends (args: { data: never }) => unknown> = Parameters<F>[0]['data']

export const useSaveTrustItem = () =>
  useTrustWrite((data: DataOf<typeof saveTrustItemFn>) => saveTrustItemFn({ data }))

export const useDeleteTrustItem = () =>
  useTrustWrite((data: DataOf<typeof deleteTrustItemFn>) => deleteTrustItemFn({ data }))

export const useReorderTrustItems = () =>
  useTrustWrite((data: DataOf<typeof reorderTrustItemsFn>) => reorderTrustItemsFn({ data }))

export const useUpdateTrustConfig = () =>
  useTrustWrite((data: DataOf<typeof updateTrustConfigFn>) => updateTrustConfigFn({ data }))

export const useSetTrustEnabled = () =>
  useTrustWrite((enabled: boolean) => setTrustEnabledFn({ data: { enabled } }))
