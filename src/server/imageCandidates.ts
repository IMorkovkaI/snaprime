interface ImageCandidate {
  url: string
  score: number
}

const MAX_IMAGES = 8

export function findImageCandidates(html: string, baseUrl: URL) {
  const candidates = new Map<string, ImageCandidate>()
  const ogImage = matchMeta(html, 'og:image')

  if (ogImage) {
    addCandidate(candidates, ogImage, baseUrl, 120)
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = readAttr(tag[0], 'src') || readAttr(tag[0], 'data-src')
    if (!src) continue

    const width = readNumberAttr(tag[0], 'width')
    const height = readNumberAttr(tag[0], 'height')
    const alt = readAttr(tag[0], 'alt')
    let score = 20

    if (width >= 300 && height >= 180) score += 35
    if (width >= 800 || height >= 450) score += 15
    if (/\b(hero|product|brand|cover|main|social)\b/i.test(alt)) score += 20
    if (/\b(logo|icon|avatar|badge|sprite|tracking|pixel)\b/i.test(`${src} ${alt}`)) {
      score -= 55
    }

    addCandidate(candidates, src, baseUrl, score)
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.url)
    .slice(0, MAX_IMAGES)
}

function addCandidate(
  candidates: Map<string, ImageCandidate>,
  rawUrl: string,
  baseUrl: URL,
  score: number,
) {
  const url = resolveUrl(rawUrl, baseUrl)
  if (!url || shouldSkip(url)) return

  const existing = candidates.get(url)
  if (!existing || existing.score < score) {
    candidates.set(url, { url, score: score + extensionScore(url) })
  }
}

function shouldSkip(url: string) {
  const lower = url.toLowerCase()
  return (
    lower.startsWith('data:') ||
    lower.endsWith('.svg') ||
    lower.includes('favicon') ||
    lower.includes('sprite') ||
    lower.includes('tracking') ||
    lower.includes('pixel')
  )
}

function extensionScore(url: string) {
  return /\.(jpe?g|png|webp)(?:[?#]|$)/i.test(url) ? 10 : 0
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
    if (match?.[1]) return match[1]
  }

  return ''
}

function readAttr(tag: string, attr: string) {
  const pattern = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i')
  return tag.match(pattern)?.[1] ?? ''
}

function readNumberAttr(tag: string, attr: string) {
  return Number.parseInt(readAttr(tag, attr), 10) || 0
}

function resolveUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(value, baseUrl)
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}
