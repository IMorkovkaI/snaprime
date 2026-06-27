import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { createProjectAction } from '../server/actions'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const navigate = useNavigate()
  const createProject = useServerFn(createProjectAction)
  const [url, setUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreating(true)
    setError('')

    try {
      const result = await createProject({ data: { url } })
      await navigate({ to: '/projects/$projectId', params: { projectId: result.id } })
    } catch (err) {
      setError(readError(err))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-12 pt-10">
      <section className="grid gap-7 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
        <div className="rise-in rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[0_24px_55px_rgba(23,58,64,0.12)] sm:p-8">
          <p className="island-kicker mb-3">Snaprime slice</p>
          <h1 className="display-title m-0 max-w-3xl text-4xl font-bold leading-none text-[var(--sea-ink)] sm:text-6xl">
            URL to editable ad previews.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--sea-ink-soft)] sm:text-lg">
            Paste a website and generate a grounded brand profile plus ad
            drafts. Missing evidence stays marked as not found, and manual edits
            persist separately from regenerated text.
          </p>

          <form onSubmit={onSubmit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="website-url">
              Website URL
            </label>
            <input
              id="website-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              required
              className="min-h-12 rounded-xl border border-[var(--line)] bg-white/85 px-4 text-base text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] transition focus:ring-2 dark:bg-[#14262b]"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="min-h-12 rounded-xl border border-[rgba(50,143,151,0.35)] bg-[var(--lagoon-deep)] px-5 font-bold text-white shadow-[0_12px_24px_rgba(50,143,151,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? 'Creating...' : 'Create ads'}
            </button>
          </form>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          ) : null}

        </div>

        <aside className="rise-in rounded-[1.5rem] border border-[var(--line)] bg-[linear-gradient(160deg,var(--surface-strong),var(--surface))] p-5 shadow-[0_20px_42px_rgba(23,58,64,0.1)]">
          <p className="island-kicker mb-3">Build constraints</p>
          <dl className="grid gap-3 text-sm">
            <div className="rounded-xl border border-[var(--line)] bg-white/45 p-4 dark:bg-white/5">
              <dt className="font-bold text-[var(--sea-ink)]">Cost cap</dt>
              <dd className="m-0 mt-1 text-[var(--sea-ink-soft)]">
                One page, 12 second extraction budget, max three ads.
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white/45 p-4 dark:bg-white/5">
              <dt className="font-bold text-[var(--sea-ink)]">Fallback</dt>
              <dd className="m-0 mt-1 text-[var(--sea-ink-soft)]">
                Browser Rendering is attempted first. If that fails, the plain
                HTML result is saved as partial.
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white/45 p-4 dark:bg-white/5">
              <dt className="font-bold text-[var(--sea-ink)]">No made-up facts</dt>
              <dd className="m-0 mt-1 text-[var(--sea-ink-soft)]">
                Profile and ad prompts use stored evidence. Missing facts stay
                marked as not found or generic.
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  )
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}
