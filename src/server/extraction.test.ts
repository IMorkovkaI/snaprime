import { describe, expect, it } from 'vitest'
import {
  MAX_SCREENSHOT_FALLBACK_BYTES,
  PLAIN_HTML_HEADERS,
  cacheKeyForUrl,
  isPrivateIpv4,
  isPrivateIpv6,
  normalizePublicUrl,
  screenshotDataUrlFromBytes,
  shouldUseScreenshotFallback,
} from './extraction'

describe('URL safety helpers', () => {
  it('normalizes public URLs for cache keys', () => {
    expect(cacheKeyForUrl('example.com/path#section')).toBe('https://example.com/path')
  })

  it('blocks local and private hostnames before fetch', () => {
    expect(() => normalizePublicUrl('http://localhost:3000')).toThrow(
      'Private, local, and loopback URLs are blocked.',
    )
    expect(() => normalizePublicUrl('http://192.168.1.10')).toThrow(
      'Private, local, and loopback URLs are blocked.',
    )
  })

  it('classifies private resolved addresses', () => {
    expect(isPrivateIpv4('10.0.0.5')).toBe(true)
    expect(isPrivateIpv4('172.20.0.5')).toBe(true)
    expect(isPrivateIpv4('8.8.8.8')).toBe(false)
    expect(isPrivateIpv6('::1')).toBe(true)
    expect(isPrivateIpv6('fe80::1')).toBe(true)
    expect(isPrivateIpv6('2606:4700:4700::1111')).toBe(false)
  })

  it('uses browser-like plain fetch headers for bot-sensitive sites', () => {
    expect(PLAIN_HTML_HEADERS['user-agent']).toContain('Mozilla/5.0')
    expect(PLAIN_HTML_HEADERS.accept).toContain('text/html')
    expect(PLAIN_HTML_HEADERS['user-agent']).not.toContain('SnaprimeTakehomeBot')
  })

  it('only uses screenshot fallback when normal image candidates are empty', () => {
    expect(shouldUseScreenshotFallback([])).toBe(true)
    expect(shouldUseScreenshotFallback(['https://example.com/social.jpg'])).toBe(false)
  })

  it('turns a small screenshot into a data URL candidate', () => {
    const result = screenshotDataUrlFromBytes(new Uint8Array([1, 2, 3]).buffer)

    expect(result).toEqual({
      ok: true,
      dataUrl: 'data:image/jpeg;base64,AQID',
    })
  })

  it('skips screenshot fallback when the image is too large for D1', () => {
    const result = screenshotDataUrlFromBytes(
      new Uint8Array(MAX_SCREENSHOT_FALLBACK_BYTES + 1).buffer,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('D1 fallback cap')
    }
  })
})
