import { describe, expect, it } from 'vitest'
import { announcementState, isLive } from '../visibility'
import { compareBannerItems } from '../presets'
import { fillPlaceholders, listPlaceholders } from '../placeholders'
import { announcementInputSchema } from '../schema'

const NOW = new Date('2026-10-10T12:00:00Z')
const at = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString()

describe('isLive', () => {
  it('is live from publishAt up to, but not at, expiresAt', () => {
    const a = { status: 'published' as const, publishAt: at(0), expiresAt: at(60) }
    expect(isLive(a, NOW)).toBe(true)
    expect(isLive({ ...a, publishAt: at(1) }, NOW)).toBe(false)
    expect(isLive({ ...a, expiresAt: at(0) }, NOW)).toBe(false)
    expect(isLive({ ...a, expiresAt: null }, NOW)).toBe(true)
  })

  it('is never live while draft or archived', () => {
    expect(isLive({ status: 'draft', publishAt: at(-5), expiresAt: null }, NOW)).toBe(false)
    expect(isLive({ status: 'archived', publishAt: at(-5), expiresAt: null }, NOW)).toBe(false)
  })
})

describe('announcementState', () => {
  it('derives every label', () => {
    const base = { publishAt: at(-5), expiresAt: null }
    expect(announcementState({ ...base, status: 'draft' }, NOW)).toBe('draft')
    expect(announcementState({ ...base, status: 'archived' }, NOW)).toBe('archived')
    expect(announcementState({ ...base, status: 'published' }, NOW)).toBe('live')
    expect(announcementState({ status: 'published', publishAt: at(5), expiresAt: null }, NOW)).toBe(
      'scheduled'
    )
    expect(
      announcementState({ status: 'published', publishAt: at(-10), expiresAt: at(-1) }, NOW)
    ).toBe('expired')
  })
})

describe('compareBannerItems', () => {
  it('orders by kind, then priority, then newest', () => {
    const item = (kind: 'critical' | 'info' | 'success', priority: number, publishAt: string) => ({
      kind,
      priority,
      publishAt,
    })
    const sorted = [
      item('success', 0, at(0)),
      item('info', 0, at(-10)),
      item('info', 5, at(-20)),
      item('critical', 0, at(-30)),
      item('info', 0, at(-1)),
    ].sort(compareBannerItems)
    expect(sorted.map((i) => `${i.kind}:${i.priority}:${i.publishAt}`)).toEqual([
      `critical:0:${at(-30)}`,
      `info:5:${at(-20)}`,
      `info:0:${at(-1)}`,
      `info:0:${at(-10)}`,
      `success:0:${at(0)}`,
    ])
  })
})

describe('placeholders', () => {
  it('lists names once, in order, across fields', () => {
    expect(listPlaceholders('Maintenance {date} {time}', 'Back by {time}, {owner}')).toEqual([
      'date',
      'time',
      'owner',
    ])
  })

  it('fills known names and leaves the rest as written', () => {
    expect(fillPlaceholders('Down {date} for {service}', { date: 'Oct 12' })).toBe(
      'Down Oct 12 for {service}'
    )
  })
})

describe('announcementInputSchema', () => {
  const valid = { kind: 'info', title: 'New SSO login', status: 'published' } as const

  it('fills defaults', () => {
    const parsed = announcementInputSchema.parse(valid)
    expect(parsed).toMatchObject({
      body: null,
      linkUrl: null,
      priority: 0,
      surfaces: ['portal'],
      audience: { tier: 'authenticated', segmentIds: [] },
    })
  })

  it('rejects a non-http link, a label without a link, and an empty segment audience', () => {
    expect(
      announcementInputSchema.safeParse({ ...valid, linkUrl: 'javascript:alert(1)' }).success
    ).toBe(false)
    expect(announcementInputSchema.safeParse({ ...valid, linkLabel: 'Read more' }).success).toBe(
      false
    )
    expect(
      announcementInputSchema.safeParse({
        ...valid,
        audience: { tier: 'segments', segmentIds: [] },
      }).success
    ).toBe(false)
  })

  it('rejects an end before the start', () => {
    expect(
      announcementInputSchema.safeParse({ ...valid, publishAt: at(60), expiresAt: at(30) }).success
    ).toBe(false)
  })

  it('caps the title at 140 characters', () => {
    expect(announcementInputSchema.safeParse({ ...valid, title: 'x'.repeat(141) }).success).toBe(
      false
    )
  })
})
