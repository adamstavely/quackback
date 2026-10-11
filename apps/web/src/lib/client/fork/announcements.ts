import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  archiveAnnouncementFn,
  deleteDraftAnnouncementFn,
  getAnnouncementsAdminFn,
  saveAnnouncementTemplatesFn,
  setAnnouncementsEnabledFn,
  updateAnnouncementsConfigFn,
  upsertAnnouncementFn,
} from '@/lib/server/functions/fork/announcements'

export const announcementKeys = {
  admin: () => ['fork', 'announcements', 'admin'] as const,
}

export const announcementQueries = {
  admin: () =>
    queryOptions({
      queryKey: announcementKeys.admin(),
      queryFn: () => getAnnouncementsAdminFn(),
      staleTime: 15 * 1000,
    }),
}

/** Every write changes what the admin page shows, so each one refreshes it. */
function useAnnouncementsWrite<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: announcementKeys.admin() }),
  })
}

type DataOf<F extends (args: { data: never }) => unknown> = Parameters<F>[0]['data']

export const useUpsertAnnouncement = () =>
  useAnnouncementsWrite((data: DataOf<typeof upsertAnnouncementFn>) =>
    upsertAnnouncementFn({ data })
  )

export const useArchiveAnnouncement = () =>
  useAnnouncementsWrite((id: string) => archiveAnnouncementFn({ data: { id } }))

export const useDeleteDraftAnnouncement = () =>
  useAnnouncementsWrite((id: string) => deleteDraftAnnouncementFn({ data: { id } }))

export const useUpdateAnnouncementsConfig = () =>
  useAnnouncementsWrite((data: DataOf<typeof updateAnnouncementsConfigFn>) =>
    updateAnnouncementsConfigFn({ data })
  )

export const useSaveAnnouncementTemplates = () =>
  useAnnouncementsWrite((data: DataOf<typeof saveAnnouncementTemplatesFn>) =>
    saveAnnouncementTemplatesFn({ data })
  )

export const useSetAnnouncementsEnabled = () =>
  useAnnouncementsWrite((enabled: boolean) => setAnnouncementsEnabledFn({ data: { enabled } }))
