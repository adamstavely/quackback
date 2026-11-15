import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  decideTrustAccessRequestFn,
  deleteTrustItemFn,
  getTrustAdminFn,
  listTrustAccessRequestsFn,
  reorderTrustItemsFn,
  saveTrustItemFn,
  setTrustEnabledFn,
  updateTrustConfigFn,
} from '@/lib/server/functions/fork/trust'
import { getTrustPageFn, requestTrustDocumentAccessFn } from '@/lib/server/functions/fork/trust-portal'

export const trustKeys = {
  admin: () => ['fork', 'trust', 'admin'] as const,
  page: () => ['fork', 'trust', 'page'] as const,
  accessRequests: () => ['fork', 'trust', 'access-requests'] as const,
}

export const trustQueries = {
  admin: () =>
    queryOptions({
      queryKey: trustKeys.admin(),
      queryFn: () => getTrustAdminFn(),
      staleTime: 15 * 1000,
    }),
  accessRequests: () =>
    queryOptions({
      queryKey: trustKeys.accessRequests(),
      queryFn: () => listTrustAccessRequestsFn(),
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

/** Approve, decline or revoke; refreshes the requests list. */
export const useDecideTrustAccess = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DataOf<typeof decideTrustAccessRequestFn>) =>
      decideTrustAccessRequestFn({ data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: trustKeys.accessRequests() }),
  })
}

/** A portal viewer asks for a restricted document; the page then shows it as requested. */
export const useRequestTrustAccess = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DataOf<typeof requestTrustDocumentAccessFn>) =>
      requestTrustDocumentAccessFn({ data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: trustKeys.page() }),
  })
}

/** Upload (or replace) a document's file through the fork's upload route. */
export const useUploadTrustDocumentFile = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
      const body = new FormData()
      body.set('file', file)
      const res = await fetch(`/api/fork-trust/documents/${documentId}/file`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? 'The upload failed. Try again.')
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: trustKeys.admin() }),
  })
}

/** The download address for a document (the route checks access). */
export const trustDocumentHref = (documentId: string) => `/api/fork-trust/documents/${documentId}`
