import { createServerFn } from '@tanstack/react-start'
import type { GeneratedAdFields } from './domain'

export const loadProjectAction = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { projectId?: unknown }).projectId === 'string'
    ) {
      return { projectId: (data as { projectId: string }).projectId }
    }

    throw new Error('projectId is required')
  })
  .handler(async ({ data, context }) => {
    const app = await import('./app')
    return app.loadProject(context, data.projectId)
  })

export const createProjectAction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { url?: unknown }).url === 'string'
    ) {
      return { url: (data as { url: string }).url }
    }

    throw new Error('url is required')
  })
  .handler(async ({ data, context }) => {
    const app = await import('./app')
    return app.createProject(context, data.url)
  })

export const saveAdAction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { adId?: unknown }).adId === 'string' &&
      typeof (data as { fields?: unknown }).fields === 'object' &&
      (data as { fields?: unknown }).fields !== null
    ) {
      const payload = data as { adId: string; fields: Partial<GeneratedAdFields> }
      return {
        adId: payload.adId,
        fields: payload.fields,
      }
    }

    throw new Error('adId and fields are required')
  })
  .handler(async ({ data, context }) => {
    const app = await import('./app')
    await app.saveAdEdits(context, data.adId, data.fields)
    return { ok: true }
  })

export const regenerateAdAction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { adId?: unknown }).adId === 'string'
    ) {
      return { adId: (data as { adId: string }).adId }
    }

    throw new Error('adId is required')
  })
  .handler(async ({ data, context }) => {
    const app = await import('./app')
    await app.regenerateAd(context, data.adId)
    return { ok: true }
  })

export const uploadAdImageAction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { adId?: unknown }).adId === 'string' &&
      typeof (data as { fileName?: unknown }).fileName === 'string' &&
      typeof (data as { contentType?: unknown }).contentType === 'string' &&
      typeof (data as { base64?: unknown }).base64 === 'string'
    ) {
      const payload = data as {
        adId: string
        fileName: string
        contentType: string
        base64: string
      }

      return payload
    }

    throw new Error('adId, fileName, contentType, and base64 are required')
  })
  .handler(async ({ data, context }) => {
    const app = await import('./app')
    return app.uploadAdImage(context, data.adId, {
      fileName: data.fileName,
      contentType: data.contentType,
      base64: data.base64,
    })
  })
