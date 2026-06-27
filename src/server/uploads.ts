import { createId } from './id'

export const MAX_UPLOAD_BYTES = 2_000_000
const MAX_D1_FALLBACK_BYTES = 500_000

export interface UploadImageInput {
  fileName: string
  contentType: string
  base64: string
}

export async function uploadImageToR2(
  bucket: R2Bucket,
  adId: string,
  input: UploadImageInput,
) {
  const { contentType, body } = validateImageInput(input, MAX_UPLOAD_BYTES)

  const key = `${adId}_${createId('img')}_${safeFileName(input.fileName)}`
  await bucket.put(key, body, {
    httpMetadata: { contentType },
  })

  return `/api/images/${encodeURIComponent(key)}`
}

export function imageUploadDataUrl(input: UploadImageInput) {
  const { contentType } = validateImageInput(input, MAX_D1_FALLBACK_BYTES)
  return `data:${contentType};base64,${input.base64}`
}

export async function readUploadedImage(env: SnaprimeEnv, key: string) {
  const object = await env.UPLOADS?.get(key)
  if (!object) return null

  return new Response(object.body, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    },
  })
}

function validateImageInput(input: UploadImageInput, maxBytes: number) {
  const contentType = input.contentType || 'application/octet-stream'
  if (!contentType.startsWith('image/')) {
    throw new Error('Only image uploads are supported.')
  }

  const body = base64ToBytes(input.base64)
  if (body.byteLength > maxBytes) {
    throw new Error(
      maxBytes === MAX_UPLOAD_BYTES
        ? 'Image upload is too large. Keep uploads under 2 MB.'
        : 'R2 is not enabled, so fallback uploads must be under 500 KB.',
    )
  }

  return { contentType, body }
}

function base64ToBytes(base64: string) {
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function safeFileName(fileName: string) {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return cleaned || 'upload'
}
