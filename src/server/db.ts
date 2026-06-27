import type {
  BrandProfile,
  EditableAd,
  ExtractionResult,
  GeneratedAdFields,
  ProjectBundle,
  ProjectSummary,
  ProjectStatus,
} from './domain'
import { createId } from './id'

interface ProjectRow {
  id: string
  input_url: string
  status: ProjectStatus
  extraction_status: ExtractionResult['status']
  error_message: string | null
  partial_reason: string | null
  cost_note: string | null
  elapsed_ms: number
  created_at: string
  updated_at: string
}

interface BrandProfileRow {
  id: string
  project_id: string
  company_description: string
  audience: string
  value_proposition: string
  tone: string
  colors_json: string
  images_json: string
  raw_evidence_json: string
}

interface AdRow {
  id: string
  project_id: string
  slot: number
  creative_idea_generated: string
  primary_text_generated: string
  headline_generated: string
  description_generated: string
  cta_generated: string
  image_url_generated: string | null
  creative_idea_override: string | null
  primary_text_override: string | null
  headline_override: string | null
  description_override: string | null
  cta_override: string | null
  image_url_override: string | null
  version: number
  user_edited_fields_json: string
  created_at: string
  updated_at: string
}

interface ExtractionCacheRow {
  normalized_url: string
  status: ExtractionResult['status']
  partial_reason: string | null
  evidence_json: string
  images_json: string
  colors_json: string
  elapsed_ms: number
}

export async function insertProject(db: D1Database, inputUrl: string) {
  const id = createId('proj')
  await db
    .prepare(
      `INSERT INTO projects (id, input_url, status, extraction_status, cost_note)
       VALUES (?, ?, 'processing', 'pending', ?)`,
    )
    .bind(id, inputUrl, 'One URL, max 3 ads, 12 second extraction budget, AI fallback enabled.')
    .run()

  return id
}

export async function updateProjectCompletion(
  db: D1Database,
  input: {
    id: string
    status: ProjectStatus
    extractionStatus: ExtractionResult['status']
    errorMessage: string | null
    partialReason: string | null
    elapsedMs: number
  },
) {
  await db
    .prepare(
      `UPDATE projects
       SET status = ?, extraction_status = ?, error_message = ?, partial_reason = ?,
           elapsed_ms = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      input.status,
      input.extractionStatus,
      input.errorMessage,
      input.partialReason,
      input.elapsedMs,
      input.id,
    )
    .run()
}

export async function upsertBrandProfile(db: D1Database, profile: BrandProfile) {
  await db
    .prepare(
      `INSERT INTO brand_profiles (
         id, project_id, company_description, audience, value_proposition, tone,
         colors_json, images_json, raw_evidence_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         company_description = excluded.company_description,
         audience = excluded.audience,
         value_proposition = excluded.value_proposition,
         tone = excluded.tone,
         colors_json = excluded.colors_json,
         images_json = excluded.images_json,
         raw_evidence_json = excluded.raw_evidence_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      profile.id,
      profile.projectId,
      profile.companyDescription,
      profile.audience,
      profile.valueProposition,
      profile.tone,
      JSON.stringify(profile.colors),
      JSON.stringify(profile.images),
      JSON.stringify(profile.rawEvidence),
    )
    .run()
}

export async function insertGeneratedAds(
  db: D1Database,
  projectId: string,
  ads: GeneratedAdFields[],
) {
  const statements = ads.slice(0, 3).map((ad, index) =>
    db
      .prepare(
        `INSERT INTO ads (
           id, project_id, slot, creative_idea_generated, primary_text_generated,
           headline_generated, description_generated, cta_generated, image_url_generated
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        createId('ad'),
        projectId,
        index + 1,
        ad.creativeIdea,
        ad.primaryText,
        ad.headline,
        ad.description,
        ad.cta,
        ad.imageUrl || null,
      ),
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

export async function getProjectBundle(
  db: D1Database,
  projectId: string,
): Promise<ProjectBundle | null> {
  const [projectResult, profileResult, adsResult] = await db.batch([
    db
      .prepare(
        `SELECT id, input_url, status, extraction_status, error_message, partial_reason,
                cost_note, elapsed_ms, created_at, updated_at
         FROM projects
         WHERE id = ?`,
      )
      .bind(projectId),
    db.prepare('SELECT * FROM brand_profiles WHERE project_id = ?').bind(projectId),
    db
      .prepare('SELECT * FROM ads WHERE project_id = ? ORDER BY slot ASC')
      .bind(projectId),
  ])

  const projectRow = projectResult.results?.[0] as ProjectRow | undefined
  if (!projectRow) {
    return null
  }

  const profileRow = profileResult.results?.[0] as BrandProfileRow | undefined
  const adRows = (adsResult.results ?? []) as AdRow[]

  return {
    project: mapProject(projectRow),
    profile: profileRow ? mapProfile(profileRow) : null,
    ads: adRows.map(mapAd),
  }
}

export async function updateAdOverrides(
  db: D1Database,
  input: { adId: string; fields: Partial<GeneratedAdFields> },
) {
  const existing = await db
    .prepare('SELECT * FROM ads WHERE id = ?')
    .bind(input.adId)
    .first<AdRow>()

  if (!existing) {
    throw new Error('Ad not found')
  }

  const edited = new Set(parseJson<string[]>(existing.user_edited_fields_json, []))
  const next: Record<keyof GeneratedAdFields, string | null> = {
    creativeIdea: existing.creative_idea_override,
    primaryText: existing.primary_text_override,
    headline: existing.headline_override,
    description: existing.description_override,
    cta: existing.cta_override,
    imageUrl: existing.image_url_override,
  }

  applyOverride(input.fields, next, edited, 'creativeIdea')
  applyOverride(input.fields, next, edited, 'primaryText')
  applyOverride(input.fields, next, edited, 'headline')
  applyOverride(input.fields, next, edited, 'description')
  applyOverride(input.fields, next, edited, 'cta')
  applyOverride(input.fields, next, edited, 'imageUrl')

  await db
    .prepare(
      `UPDATE ads
       SET creative_idea_override = ?, primary_text_override = ?, headline_override = ?,
           description_override = ?, cta_override = ?, image_url_override = ?,
           user_edited_fields_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      next.creativeIdea,
      next.primaryText,
      next.headline,
      next.description,
      next.cta,
      next.imageUrl,
      JSON.stringify([...edited]),
      input.adId,
    )
    .run()
}

export async function updateGeneratedAd(
  db: D1Database,
  input: { adId: string; ad: GeneratedAdFields },
) {
  await db
    .prepare(
      `UPDATE ads
       SET creative_idea_generated = ?, primary_text_generated = ?, headline_generated = ?,
           description_generated = ?, cta_generated = ?, image_url_generated = ?,
           version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      input.ad.creativeIdea,
      input.ad.primaryText,
      input.ad.headline,
      input.ad.description,
      input.ad.cta,
      input.ad.imageUrl || null,
      input.adId,
    )
    .run()
}

export async function getAd(db: D1Database, adId: string) {
  const row = await db.prepare('SELECT * FROM ads WHERE id = ?').bind(adId).first<AdRow>()
  return row ? mapAd(row) : null
}

export async function getCachedExtraction(db: D1Database, normalizedUrl: string) {
  const row = await db
    .prepare('SELECT * FROM extraction_cache WHERE normalized_url = ?')
    .bind(normalizedUrl)
    .first<ExtractionCacheRow>()

  return row ? mapCachedExtraction(row) : null
}

export async function upsertExtractionCache(
  db: D1Database,
  normalizedUrl: string,
  extraction: ExtractionResult,
) {
  if (extraction.status === 'failed') return

  await db
    .prepare(
      `INSERT INTO extraction_cache (
         normalized_url, status, partial_reason, evidence_json, images_json, colors_json, elapsed_ms
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(normalized_url) DO UPDATE SET
         status = excluded.status,
         partial_reason = excluded.partial_reason,
         evidence_json = excluded.evidence_json,
         images_json = excluded.images_json,
         colors_json = excluded.colors_json,
         elapsed_ms = excluded.elapsed_ms,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      normalizedUrl,
      extraction.status,
      extraction.partialReason,
      JSON.stringify(extraction.evidence),
      JSON.stringify(extraction.images),
      JSON.stringify(extraction.colors),
      extraction.elapsedMs,
    )
    .run()
}

function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    inputUrl: row.input_url,
    status: row.status,
    extractionStatus: row.extraction_status,
    errorMessage: row.error_message,
    partialReason: row.partial_reason,
    costNote: row.cost_note,
    elapsedMs: row.elapsed_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function applyOverride(
  fields: Partial<GeneratedAdFields>,
  next: Record<keyof GeneratedAdFields, string | null>,
  edited: Set<string>,
  key: keyof GeneratedAdFields,
) {
  if (Object.prototype.hasOwnProperty.call(fields, key)) {
    next[key] = fields[key] ?? null
    edited.add(key)
  }
}

function mapCachedExtraction(row: ExtractionCacheRow): ExtractionResult {
  return {
    status: row.status,
    partialReason: row.partial_reason
      ? `${row.partial_reason} Cached extraction was reused.`
      : 'Cached extraction was reused.',
    evidence: parseJson(row.evidence_json, []),
    images: parseJson<string[]>(row.images_json, []),
    colors: parseJson<string[]>(row.colors_json, []),
    elapsedMs: row.elapsed_ms,
  }
}

function mapProfile(row: BrandProfileRow): BrandProfile {
  return {
    id: row.id,
    projectId: row.project_id,
    companyDescription: row.company_description,
    audience: row.audience,
    valueProposition: row.value_proposition,
    tone: row.tone,
    colors: parseJson<string[]>(row.colors_json, []),
    images: parseJson<string[]>(row.images_json, []),
    rawEvidence: parseJson(row.raw_evidence_json, []),
  }
}

function mapAd(row: AdRow): EditableAd {
  const generated = {
    creativeIdea: row.creative_idea_generated,
    primaryText: row.primary_text_generated,
    headline: row.headline_generated,
    description: row.description_generated,
    cta: row.cta_generated,
    imageUrl: row.image_url_generated ?? '',
  }
  const overrides = {
    creativeIdea: row.creative_idea_override ?? undefined,
    primaryText: row.primary_text_override ?? undefined,
    headline: row.headline_override ?? undefined,
    description: row.description_override ?? undefined,
    cta: row.cta_override ?? undefined,
    imageUrl: row.image_url_override ?? undefined,
  }

  return {
    id: row.id,
    projectId: row.project_id,
    slot: row.slot,
    version: row.version,
    generated,
    overrides,
    creativeIdea: overrides.creativeIdea ?? generated.creativeIdea,
    primaryText: overrides.primaryText ?? generated.primaryText,
    headline: overrides.headline ?? generated.headline,
    description: overrides.description ?? generated.description,
    cta: overrides.cta ?? generated.cta,
    imageUrl: overrides.imageUrl ?? generated.imageUrl,
    userEditedFields: parseJson<string[]>(row.user_edited_fields_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
