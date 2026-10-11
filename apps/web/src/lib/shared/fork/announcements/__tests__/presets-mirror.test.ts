import { describe, expect, it } from 'vitest'
import { KIND_PRESETS } from '../presets'
import { KIND_PRESETS as EMBED_PRESETS } from '../../../../../../../../packages/widget/src/fork/banner/presets'

/** The embed mirrors the portal's presets (it cannot import the app); they must not drift. */
describe('embed banner presets', () => {
  it('match the portal presets', () => {
    expect(EMBED_PRESETS).toEqual(KIND_PRESETS)
  })
})
