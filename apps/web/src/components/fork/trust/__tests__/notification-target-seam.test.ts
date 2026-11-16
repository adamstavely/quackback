/** Seam T-20: a Trust & Security update in the bell opens the Updates tab. */
import { expect, it } from 'vitest'
import { getNotificationTarget } from '@/components/notifications/notification-target'

it('links a fork_trust_update notification to /trust/updates', () => {
  const notification = {
    type: 'fork_trust_update',
    post: null,
    postId: null,
  } as unknown as Parameters<typeof getNotificationTarget>[0]
  expect(getNotificationTarget(notification)).toEqual({ to: '/trust/updates' })
})
