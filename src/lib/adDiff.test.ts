import { describe, expect, it } from 'vitest'
import { diffAdDraft } from './adDiff'
import type { EditableAd, GeneratedAdFields } from '../server/domain'

const generated: GeneratedAdFields = {
  creativeIdea: 'Generated idea',
  primaryText: 'Generated primary',
  headline: 'Generated headline',
  description: 'Generated description',
  cta: 'Learn More',
  imageUrl: 'https://example.com/generated.jpg',
}

const ad = {
  generated,
} satisfies Pick<EditableAd, 'generated'>

describe('diffAdDraft', () => {
  it('returns no overrides when the draft matches generated fields', () => {
    expect(diffAdDraft(ad, generated)).toEqual({})
  })

  it('returns only the fields the user actually changed', () => {
    expect(
      diffAdDraft(ad, {
        ...generated,
        primaryText: 'Edited primary',
        cta: 'Book Now',
      }),
    ).toEqual({
      primaryText: 'Edited primary',
      cta: 'Book Now',
    })
  })
})
