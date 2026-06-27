export function getEnv(context: unknown): SnaprimeEnv {
  const ctx = context as SnaprimeRequestContext | undefined
  return ctx?.cloudflare?.env ?? {}
}

export function getDb(context: unknown): D1Database {
  const db = getEnv(context).DB

  if (!db) {
    throw new Error(
      'D1 binding DB is missing. Create a D1 database, update wrangler.jsonc, and run migrations.',
    )
  }

  return db
}
