import '@tanstack/react-start'
import '@tanstack/router-core'

export {}

declare global {
  type D1Value = string | number | boolean | null | ArrayBuffer

  interface D1Result<T = unknown> {
    results?: T[]
    success: boolean
    meta: {
      duration?: number
      last_row_id?: number
      changes?: number
    }
  }

  interface D1PreparedStatement {
    bind: (...values: D1Value[]) => D1PreparedStatement
    first: <T = unknown>(columnName?: string) => Promise<T | null>
    all: <T = unknown>() => Promise<D1Result<T>>
    run: () => Promise<D1Result>
  }

  interface D1Database {
    prepare: (query: string) => D1PreparedStatement
    batch: <T = unknown>(statements: D1PreparedStatement[]) => Promise<D1Result<T>[]>
  }

  interface WorkersAi {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>
  }

  interface R2ObjectBody {
    body: ReadableStream
    httpMetadata?: {
      contentType?: string
    }
  }

  interface R2Bucket {
    put: (
      key: string,
      value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>
    get: (key: string) => Promise<R2ObjectBody | null>
  }

  interface SnaprimeEnv {
    DB?: D1Database
    AI?: WorkersAi
    UPLOADS?: R2Bucket
    AI_MODEL?: string
    CLOUDFLARE_ACCOUNT_ID?: string
    CLOUDFLARE_BROWSER_RENDERING_API_TOKEN?: string
    EXTRACTION_MAX_MS?: string
  }

  interface SnaprimeRequestContext {
    cloudflare?: {
      env?: SnaprimeEnv
      ctx?: unknown
    }
  }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: SnaprimeRequestContext
    }
  }
}

declare module '@tanstack/router-core' {
  interface Register {
    server: {
      requestContext: SnaprimeRequestContext
    }
  }
}
