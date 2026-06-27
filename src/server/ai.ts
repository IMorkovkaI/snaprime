import type { BrandProfile, EditableAd, GeneratedAdFields } from './domain'

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct'

export async function normalizeProfileWithAi(
  profile: BrandProfile,
  env: SnaprimeEnv,
): Promise<BrandProfile> {
  const prompt = `Return strict JSON for this brand profile. Use only evidence. If unsupported, write "not found".

Schema:
{"companyDescription":"string","audience":"string","valueProposition":"string","tone":"string"}

Evidence:
${profile.rawEvidence.map((item) => `[${item.source}] ${item.text}`).join('\n')}

Current fallback:
${JSON.stringify({
  companyDescription: profile.companyDescription,
  audience: profile.audience,
  valueProposition: profile.valueProposition,
  tone: profile.tone,
})}`

  const parsed = await runJson<Partial<BrandProfile>>(env, prompt, 650)
  if (!parsed) {
    return profile
  }

  return {
    ...profile,
    companyDescription: cleanField(parsed.companyDescription, profile.companyDescription),
    audience: cleanField(parsed.audience, profile.audience),
    valueProposition: cleanField(parsed.valueProposition, profile.valueProposition),
    tone: cleanField(parsed.tone, profile.tone),
  }
}

export async function generateAdsWithAi(
  profile: BrandProfile,
  env: SnaprimeEnv,
  count = 3,
): Promise<GeneratedAdFields[]> {
  const prompt = `Generate ${Math.min(count, 3)} editable ads as strict JSON. Use only profile/evidence facts. Do not invent offers, metrics, customers, pricing, or features.

Return:
{"ads":[{"creativeIdea":"string","primaryText":"string","headline":"string","description":"string","cta":"string","imageUrl":"string"}]}

Brand profile:
${JSON.stringify({
  companyDescription: profile.companyDescription,
  audience: profile.audience,
  valueProposition: profile.valueProposition,
  tone: profile.tone,
  images: profile.images,
})}

Evidence:
${profile.rawEvidence.map((item) => `[${item.source}] ${item.text}`).join('\n')}

If a field lacks support, keep it generic and evidence-safe.`

  const parsed = await runJson<{ ads?: GeneratedAdFields[] }>(env, prompt, 1200)
  const ads = parsed?.ads?.filter(isAd).slice(0, 3)

  return ads && ads.length > 0 ? ads : deterministicAds(profile, count)
}

export async function regenerateAdWithAi(
  profile: BrandProfile,
  currentAd: EditableAd,
  env: SnaprimeEnv,
): Promise<GeneratedAdFields> {
  const [ad] = await generateAdsWithAi(
    {
      ...profile,
      rawEvidence: [
        ...profile.rawEvidence,
        {
          source: 'current ad',
          text: `Regenerate ad ${currentAd.slot}. Keep user overrides intact outside generated fields.`,
        },
      ],
    },
    env,
    1,
  )

  return ad
}

export function deterministicAds(profile: BrandProfile, count = 3): GeneratedAdFields[] {
  const safeCompany =
    profile.companyDescription === 'not found'
      ? 'this brand'
      : trim(profile.companyDescription, 96)
  const value =
    profile.valueProposition === 'not found'
      ? 'See what the website says and decide if it fits.'
      : trim(profile.valueProposition, 120)
  const image = profile.images[0] ?? ''

  return [
    {
      creativeIdea: 'Lead with the clearest website-backed value proposition.',
      primaryText: `${safeCompany} ${value}`,
      headline: trim(safeCompany, 40),
      description: value,
      cta: 'Learn More',
      imageUrl: image,
    },
    {
      creativeIdea: 'Frame the brand as a practical next step for its stated audience.',
      primaryText: `Built for ${profile.audience === 'not found' ? 'people exploring the site' : profile.audience}. ${value}`,
      headline: 'Explore the Brand',
      description: trim(value, 90),
      cta: 'Get Started',
      imageUrl: profile.images[1] ?? image,
    },
    {
      creativeIdea: 'Use a concise problem-to-solution angle without adding unsupported claims.',
      primaryText: `Looking for a better fit? ${safeCompany}`,
      headline: 'See How It Works',
      description: trim(value, 90),
      cta: 'View Details',
      imageUrl: profile.images[2] ?? image,
    },
  ].slice(0, Math.max(1, Math.min(count, 3)))
}

async function runJson<T>(
  env: SnaprimeEnv,
  prompt: string,
  maxTokens: number,
): Promise<T | null> {
  if (!env.AI) {
    return null
  }

  try {
    const result = await env.AI.run(env.AI_MODEL ?? DEFAULT_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You are a strict JSON generator for ad previews. Return JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
    })

    const text = extractText(result)
    return parseJsonObject<T>(text)
  } catch {
    return null
  }
}

function extractText(result: unknown) {
  if (typeof result === 'string') return result
  if (typeof result === 'object' && result !== null && 'response' in result) {
    const response = (result as { response?: unknown }).response
    return typeof response === 'string' ? response : JSON.stringify(response)
  }
  return JSON.stringify(result)
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

function isAd(value: unknown): value is GeneratedAdFields {
  const ad = value as GeneratedAdFields
  return Boolean(ad.primaryText && ad.headline && ad.description && ad.cta)
}

function cleanField(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function trim(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value
}
