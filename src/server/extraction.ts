import type { BrandProfile, EvidenceSnippet, ExtractionResult } from './domain'
import { createId } from './id'
import { findImageCandidates } from './imageCandidates'

const DEFAULT_EXTRACT_MS = 12_000
const DNS_VERIFY_MS = 2_500
const MAX_BODY_CHARS = 80_000
const MAX_EVIDENCE = 10
export const MAX_SCREENSHOT_FALLBACK_BYTES = 350_000
export const PLAIN_HTML_HEADERS = {
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
}

export async function extractUrl(
  rawUrl: string,
  env: SnaprimeEnv,
): Promise<ExtractionResult> {
  const started = Date.now()
  const url = normalizePublicUrl(rawUrl)
  const timeoutMs = Number(env.EXTRACTION_MAX_MS ?? DEFAULT_EXTRACT_MS)
  const dnsCheck = await verifyPublicDns(url, Math.min(timeoutMs, DNS_VERIFY_MS))
  if (!dnsCheck.ok) {
    return failedExtraction(url, dnsCheck.reason, started)
  }

  const rendered = await tryRenderedMarkdown(url, env, timeoutMs)
  if (rendered.ok) {
    const evidence = evidenceFromText(rendered.text, url.hostname, 'rendered markdown')
    const html = rendered.html ?? ''
    const images = findImages(html, url)
    const screenshot = await screenshotFallback(url, env, timeoutMs, images)

    return {
      status: 'rendered',
      partialReason: screenshot.partialReason,
      evidence,
      images: screenshot.images,
      colors: findColors(html),
      elapsedMs: Date.now() - started,
    }
  }

  const plain = await tryPlainHtml(url, timeoutMs)
  if (plain.ok) {
    const evidence = evidenceFromHtml(plain.html, url)
    const images = findImages(plain.html, url)
    const screenshot = await screenshotFallback(url, env, timeoutMs, images)
    const reason = rendered.reason
      ? `Rendered fetch unavailable: ${rendered.reason}. Used plain HTML fallback.`
      : 'Used plain HTML fallback.'

    return {
      status: 'plain-html',
      partialReason: appendPartialReason(reason, screenshot.partialReason),
      evidence,
      images: screenshot.images,
      colors: findColors(plain.html),
      elapsedMs: Date.now() - started,
    }
  }

  return {
    ...failedExtraction(url, plain.reason || rendered.reason || 'The page could not be read.', started),
  }
}

export function cacheKeyForUrl(rawUrl: string) {
  const url = normalizePublicUrl(rawUrl)
  url.hash = ''
  return url.href
}

export function shouldUseScreenshotFallback(images: string[]) {
  return images.length === 0
}

export function deriveProfileFromEvidence(
  projectId: string,
  extraction: ExtractionResult,
): BrandProfile {
  const joined = extraction.evidence.map((item) => item.text).join(' ')
  const title = extraction.evidence[0]?.text ?? 'not found'
  const firstSentence = sentence(joined) || title

  return {
    id: createId('profile'),
    projectId,
    companyDescription: firstSentence || 'not found',
    audience: inferAudience(joined),
    valueProposition: inferValue(joined),
    tone: inferTone(joined),
    colors: extraction.colors,
    images: extraction.images,
    rawEvidence: extraction.evidence,
  }
}

export function normalizePublicUrl(rawUrl: string) {
  const withProtocol = /^https?:\/\//i.test(rawUrl.trim())
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`
  const url = new URL(withProtocol)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are supported.')
  }

  const host = url.hostname.toLowerCase()
  if (isPrivateHostname(host) || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error('Private, local, and loopback URLs are blocked.')
  }

  return url
}

export function isPrivateIpv4(host: string) {
  const parts = host.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = parts
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export function isPrivateIpv6(host: string) {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  )
}

function isPrivateHostname(host: string) {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
}

async function verifyPublicDns(
  url: URL,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const host = url.hostname.toLowerCase()
  if (isIpv4(host) || host.includes(':')) {
    return { ok: true }
  }

  const records = await Promise.all([
    resolveDns(host, 'A', timeoutMs),
    resolveDns(host, 'AAAA', timeoutMs),
  ])
  const addresses = records.flatMap((record) => record.addresses)
  const failure = records.find((record) => record.error)

  if (addresses.length === 0) {
    return {
      ok: false,
      reason: failure?.error ?? 'Could not verify public DNS records for the URL host.',
    }
  }

  const blocked = addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))
  if (blocked) {
    return { ok: false, reason: 'URL host resolves to a private or local network address.' }
  }

  return { ok: true }
}

async function resolveDns(host: string, type: 'A' | 'AAAA', timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      return { addresses: [], error: `DNS lookup returned ${response.status}` }
    }

    const payload = (await response.json()) as {
      Answer?: Array<{ type?: number; data?: string }>
    }
    const expectedType = type === 'A' ? 1 : 28
    const addresses =
      payload.Answer?.filter((answer) => answer.type === expectedType)
        .map((answer) => answer.data)
        .filter((value): value is string => Boolean(value)) ?? []

    return { addresses, error: '' }
  } catch (error) {
    return { addresses: [], error: readableError(error) }
  } finally {
    clearTimeout(timeout)
  }
}

function isIpv4(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
}

async function tryRenderedMarkdown(
  url: URL,
  env: SnaprimeEnv,
  timeoutMs: number,
): Promise<{ ok: true; text: string; html?: string } | { ok: false; reason: string }> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN) {
    return { ok: false, reason: 'Browser Rendering credentials are not configured' }
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering`
  const markdown = await postRendering(`${base}/markdown`, url.href, env, timeoutMs)
  if (!markdown.ok) {
    return markdown
  }

  const content = await postRendering(`${base}/content`, url.href, env, timeoutMs)

  return {
    ok: true,
    text: markdown.text,
    html: content.ok ? content.text : undefined,
  }
}

async function postRendering(
  endpoint: string,
  url: string,
  env: SnaprimeEnv,
  timeoutMs: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, waitUntil: 'load' }),
      signal: controller.signal,
    })

    const text = await response.text()
    if (!response.ok) {
      return { ok: false, reason: `Browser Rendering returned ${response.status}` }
    }

    return { ok: true, text: unwrapRenderingText(text) }
  } catch (error) {
    return { ok: false, reason: readableError(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function tryPlainHtml(
  url: URL,
  timeoutMs: number,
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url.href, {
      headers: PLAIN_HTML_HEADERS,
      signal: controller.signal,
    })

    if (!response.ok) {
      return { ok: false, reason: `Plain fetch returned ${response.status}` }
    }

    const html = (await response.text()).slice(0, MAX_BODY_CHARS)
    return { ok: true, html }
  } catch (error) {
    return { ok: false, reason: readableError(error) }
  } finally {
    clearTimeout(timeout)
  }
}

function evidenceFromHtml(html: string, url: URL): EvidenceSnippet[] {
  const snippets: EvidenceSnippet[] = []
  const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const description = matchMeta(html, 'description')
  const ogTitle = matchMeta(html, 'og:title')
  const ogDescription = matchMeta(html, 'og:description')
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .slice(0, 5)
  const visibleText = htmlToText(html)

  addSnippet(snippets, 'title', title)
  addSnippet(snippets, 'meta description', description)
  addSnippet(snippets, 'og:title', ogTitle)
  addSnippet(snippets, 'og:description', ogDescription)
  headings.forEach((heading, index) => addSnippet(snippets, `heading ${index + 1}`, heading))

  chunkText(visibleText, 360)
    .slice(0, 4)
    .forEach((chunk, index) => addSnippet(snippets, `body ${index + 1}`, chunk))

  if (snippets.length === 0) {
    addSnippet(snippets, 'system', `No readable text found on ${url.href}.`)
  }

  return snippets.slice(0, MAX_EVIDENCE)
}

function evidenceFromText(text: string, host: string, source: string): EvidenceSnippet[] {
  const cleaned = cleanText(text).slice(0, MAX_BODY_CHARS)
  const chunks = chunkText(cleaned, 420).slice(0, MAX_EVIDENCE)

  return chunks.length > 0
    ? chunks.map((chunk, index) => ({ source: `${source} ${index + 1}`, text: chunk }))
    : [{ source: 'system', text: `No rendered text found on ${host}.` }]
}

function findImages(html: string, baseUrl: URL) {
  return findImageCandidates(html, baseUrl)
}

async function screenshotFallback(
  url: URL,
  env: SnaprimeEnv,
  timeoutMs: number,
  images: string[],
) {
  if (!shouldUseScreenshotFallback(images)) {
    return { images, partialReason: null }
  }

  const screenshot = await tryScreenshot(url, env, timeoutMs)
  if (screenshot.ok) {
    return { images: [screenshot.dataUrl], partialReason: null }
  }

  return {
    images,
    partialReason: `No image candidates found. Screenshot fallback skipped: ${screenshot.reason}`,
  }
}

async function tryScreenshot(
  url: URL,
  env: SnaprimeEnv,
  timeoutMs: number,
): Promise<{ ok: true; dataUrl: string } | { ok: false; reason: string }> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN) {
    return { ok: false, reason: 'Browser Rendering credentials are not configured' }
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url.href,
        viewport: { width: 1200, height: 630 },
        gotoOptions: { waitUntil: 'load', timeout: timeoutMs },
        screenshotOptions: { type: 'jpeg', quality: 45, fullPage: false },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { ok: false, reason: `Browser Rendering screenshot returned ${response.status}` }
    }

    return await readScreenshotResponse(response)
  } catch (error) {
    return { ok: false, reason: readableError(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function readScreenshotResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (contentType.includes('application/json')) {
    return screenshotDataUrlFromJson(await response.text())
  }

  return screenshotDataUrlFromBytes(await response.arrayBuffer(), contentType)
}

export function screenshotDataUrlFromBytes(arrayBuffer: ArrayBuffer, contentType = 'image/jpeg') {
  if (arrayBuffer.byteLength > MAX_SCREENSHOT_FALLBACK_BYTES) {
    return {
      ok: false as const,
      reason: `screenshot was ${arrayBuffer.byteLength} bytes, over the ${MAX_SCREENSHOT_FALLBACK_BYTES} byte D1 fallback cap`,
    }
  }

  const mimeType = contentType.split(';')[0] || 'image/jpeg'
  return {
    ok: true as const,
    dataUrl: `data:${mimeType};base64,${arrayBufferToBase64(arrayBuffer)}`,
  }
}

function screenshotDataUrlFromJson(text: string) {
  try {
    const parsed = JSON.parse(text) as {
      result?: string | { screenshot?: string; data?: string; contentType?: string }
    }
    const value =
      typeof parsed.result === 'string'
        ? parsed.result
        : parsed.result?.screenshot ?? parsed.result?.data ?? ''
    const contentType =
      typeof parsed.result === 'object' ? parsed.result.contentType ?? 'image/jpeg' : 'image/jpeg'

    if (!value) {
      return { ok: false as const, reason: 'screenshot response did not include image data' }
    }

    if (value.startsWith('data:image/')) {
      if (estimatedBase64Bytes(value.split(',').at(1) ?? value) > MAX_SCREENSHOT_FALLBACK_BYTES) {
        return {
          ok: false as const,
          reason: `screenshot response was too large for the D1 fallback cap`,
        }
      }
      return { ok: true as const, dataUrl: value }
    }

    if (estimatedBase64Bytes(value) > MAX_SCREENSHOT_FALLBACK_BYTES) {
      return {
        ok: false as const,
        reason: `screenshot response was too large for the D1 fallback cap`,
      }
    }

    return {
      ok: true as const,
      dataUrl: `data:${contentType};base64,${value}`,
    }
  } catch {
    return { ok: false as const, reason: 'screenshot response was not valid JSON' }
  }
}

function estimatedBase64Bytes(value: string) {
  return Math.ceil((value.replace(/=+$/, '').length * 3) / 4)
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
}

function findColors(html: string) {
  const colors = new Set<string>()
  for (const match of html.matchAll(/#[0-9a-f]{6}\b/gi)) {
    colors.add(match[0].toLowerCase())
    if (colors.size >= 6) {
      break
    }
  }

  return [...colors]
}

function matchMeta(html: string, name: string) {
  const escaped = name.replace(':', '\\:')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return cleanText(match[1])
    }
  }

  return ''
}

function matchFirst(html: string, pattern: RegExp) {
  return cleanText(html.match(pattern)?.[1] ?? '')
}

function htmlToText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
}

function addSnippet(snippets: EvidenceSnippet[], source: string, text: string) {
  const cleaned = cleanText(text)
  if (cleaned.length > 0) {
    snippets.push({ source, text: cleaned.slice(0, 520) })
  }
}

function chunkText(text: string, size: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + ` ${word}`).length > size && current.length > 0) {
      chunks.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function sentence(text: string) {
  return cleanText(text).match(/[^.!?]+[.!?]/)?.[0]?.trim() ?? cleanText(text).slice(0, 220)
}

function inferAudience(text: string) {
  const lower = text.toLowerCase()
  if (/\bdevelopers?\b|\bapi\b|\bengineering\b/.test(lower)) return 'developers and technical teams'
  if (/\bmarketers?\b|\bagenc(y|ies)\b|\badvertis/.test(lower)) return 'marketing teams'
  if (/\benterprise\b|\bteams\b|\bbusinesses\b/.test(lower)) return 'business teams'
  return 'not found'
}

function inferValue(text: string) {
  const lower = text.toLowerCase()
  if (/\bsave\b|\bfaster\b|\bautomate\b|\bwithout\b/.test(lower)) {
    return sentence(text) || 'not found'
  }
  return 'not found'
}

function inferTone(text: string) {
  const lower = text.toLowerCase()
  if (/\benterprise\b|\bsecure\b|\breliable\b/.test(lower)) return 'professional and trustworthy'
  if (/\bfast\b|\bsimple\b|\beasy\b/.test(lower)) return 'direct and practical'
  if (/\bcreative\b|\bbeautiful\b|\bbrand\b/.test(lower)) return 'creative and polished'
  return 'not found'
}

function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function unwrapRenderingText(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      result?: string | { content?: string; markdown?: string; html?: string }
    }
    if (typeof parsed.result === 'string') return parsed.result
    if (parsed.result?.markdown) return parsed.result.markdown
    if (parsed.result?.content) return parsed.result.content
    if (parsed.result?.html) return parsed.result.html
  } catch {
    return value
  }

  return value
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function appendPartialReason(current: string | null, next: string | null) {
  if (!current) return next
  if (!next) return current
  return `${current} ${next}`
}

function failedExtraction(url: URL, reason: string, started: number): ExtractionResult {
  return {
    status: 'failed',
    partialReason: reason,
    evidence: [
      {
        source: 'system',
        text: `Could not extract readable content from ${url.href}.`,
      },
    ],
    images: [],
    colors: [],
    elapsedMs: Date.now() - started,
  }
}
