import { describe, expect, it } from 'vitest'
import { isNewerRevision } from '../use-banner-stream'

describe('isNewerRevision', () => {
  const applied = { epoch: 'E1', revision: 5 }

  it('takes a higher revision in the same epoch', () => {
    expect(isNewerRevision({ epoch: 'E1', revision: 6 }, applied)).toBe(true)
  })

  it('ignores the same or an older revision in the same epoch', () => {
    expect(isNewerRevision({ epoch: 'E1', revision: 5 }, applied)).toBe(false)
    expect(isNewerRevision({ epoch: 'E1', revision: 4 }, applied)).toBe(false)
  })

  it('takes any revision from a new epoch, and anything before the first feed', () => {
    expect(isNewerRevision({ epoch: 'E2', revision: 1 }, applied)).toBe(true)
    expect(isNewerRevision({ epoch: 'E1', revision: 0 }, null)).toBe(true)
  })
})
