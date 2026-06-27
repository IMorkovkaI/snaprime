import {
  getCachedExtraction,
  getAd,
  getProjectBundle,
  insertGeneratedAds,
  insertProject,
  updateAdOverrides,
  updateGeneratedAd,
  updateProjectCompletion,
  upsertExtractionCache,
  upsertBrandProfile,
} from './db'
import type { CreateProjectResult, GeneratedAdFields, ProjectBundle } from './domain'
import { deterministicAds, generateAdsWithAi, normalizeProfileWithAi, regenerateAdWithAi } from './ai'
import { getDb, getEnv } from './context'
import { cacheKeyForUrl, deriveProfileFromEvidence, extractUrl } from './extraction'
import type { UploadImageInput } from './uploads'
import { imageUploadDataUrl, uploadImageToR2 } from './uploads'

export async function loadProject(
  context: unknown,
  projectId: string,
): Promise<ProjectBundle | null> {
  return getProjectBundle(getDb(context), projectId)
}

export async function createProject(
  context: unknown,
  inputUrl: string,
): Promise<CreateProjectResult> {
  const db = getDb(context)
  const env = getEnv(context)
  const id = await insertProject(db, inputUrl)

  try {
    const cacheKey = cacheKeyForUrl(inputUrl)
    const cached = await getCachedExtraction(db, cacheKey)
    const extraction = cached ?? (await extractUrl(inputUrl, env))
    if (!cached) {
      await upsertExtractionCache(db, cacheKey, extraction)
    }

    const fallbackProfile = deriveProfileFromEvidence(id, extraction)
    const profile = await normalizeProfileWithAi(fallbackProfile, env)
    const ads =
      extraction.status === 'failed'
        ? deterministicAds(profile, 1)
        : await generateAdsWithAi(profile, env, 3)
    const status = extraction.status === 'rendered' ? 'ready' : 'partial'

    await upsertBrandProfile(db, profile)
    await insertGeneratedAds(db, id, ads)
    await updateProjectCompletion(db, {
      id,
      status,
      extractionStatus: extraction.status,
      errorMessage: extraction.status === 'failed' ? extraction.partialReason : null,
      partialReason: extraction.partialReason,
      elapsedMs: extraction.elapsedMs,
    })

    return { id }
  } catch (error) {
    await updateProjectCompletion(db, {
      id,
      status: 'failed',
      extractionStatus: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      partialReason: 'Project creation failed before a usable profile could be stored.',
      elapsedMs: 0,
    })

    return { id }
  }
}

export async function saveAdEdits(
  context: unknown,
  adId: string,
  fields: Partial<GeneratedAdFields>,
) {
  await updateAdOverrides(getDb(context), { adId, fields })
}

export async function regenerateAd(context: unknown, adId: string) {
  const db = getDb(context)
  const env = getEnv(context)
  const current = await getAd(db, adId)

  if (!current) {
    throw new Error('Ad not found')
  }

  const bundle = await getProjectBundle(db, current.projectId)
  if (!bundle?.profile) {
    throw new Error('Brand profile not found')
  }

  const next = await regenerateAdWithAi(bundle.profile, current, env)
  await updateGeneratedAd(db, { adId, ad: next })
}

export async function uploadAdImage(
  context: unknown,
  adId: string,
  input: UploadImageInput,
) {
  const env = getEnv(context)
  const imageUrl = env.UPLOADS
    ? await uploadImageToR2(env.UPLOADS, adId, input)
    : imageUploadDataUrl(input)

  await updateAdOverrides(getDb(context), { adId, fields: { imageUrl } })
  return { imageUrl }
}
