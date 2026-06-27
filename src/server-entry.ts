import start from '@tanstack/react-start/server-entry'
import { readUploadedImage } from './server/uploads'

export default {
  async fetch(request: Request, env: SnaprimeEnv, ctx: unknown) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/images/')) {
      const key = decodeURIComponent(url.pathname.replace('/api/images/', ''))
      const response = await readUploadedImage(env, key)
      return response ?? new Response('Image not found', { status: 404 })
    }

    const options = {
      context: {
        cloudflare: { env, ctx },
      },
    } as unknown as Parameters<typeof start.fetch>[1]

    return start.fetch(request, options)
  },
}
