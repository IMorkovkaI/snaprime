import { describe, expect, it } from 'vitest'
import { findImageCandidates } from './imageCandidates'

describe('findImageCandidates', () => {
  it('deduplicates images and prefers useful large candidates', () => {
    const images = findImageCandidates(
      `
        <meta property="og:image" content="/social.jpg">
        <img src="/favicon.svg" width="32" height="32" alt="logo icon">
        <img src="/product.jpg#v1" width="960" height="540" alt="Hero product photo">
        <img data-src="/product.jpg" width="960" height="540" alt="Hero product photo">
        <img src="/tiny.png" width="1" height="1" alt="tracking pixel">
      `,
      new URL('https://example.com/path/'),
    )

    expect(images).toEqual([
      'https://example.com/social.jpg',
      'https://example.com/product.jpg',
    ])
  })
})
