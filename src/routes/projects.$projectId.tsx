import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useMemo, useState } from 'react'
import {
  loadProjectAction,
  regenerateAdAction,
  saveAdAction,
  uploadAdImageAction,
} from '../server/actions'
import type { EditableAd, GeneratedAdFields, ProjectBundle } from '../server/domain'
import { diffAdDraft } from '../lib/adDiff'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectPage,
})

const MAX_IMAGE_UPLOAD_BYTES = 2_000_000

type Drafts = Partial<Record<string, GeneratedAdFields>>

function ProjectPage() {
  const { projectId } = Route.useParams()
  const loadProject = useServerFn(loadProjectAction)
  const saveAd = useServerFn(saveAdAction)
  const regenerateAd = useServerFn(regenerateAdAction)
  const uploadAdImage = useServerFn(uploadAdImageAction)
  const [bundle, setBundle] = useState<ProjectBundle | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [busyAdId, setBusyAdId] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    const next = await loadProject({ data: { projectId } })
    setBundle(next)
    setDrafts(Object.fromEntries((next?.ads ?? []).map((ad) => [ad.id, adToDraft(ad)])))
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setError(readError(err)))
  }, [projectId])

  const images = useMemo(() => bundle?.profile?.images ?? [], [bundle])

  async function save(ad: EditableAd) {
    const draft = drafts[ad.id]
    if (!draft) return

    const fields = diffAdDraft(ad, draft)
    if (Object.keys(fields).length === 0) return

    setBusyAdId(ad.id)
    setError('')
    try {
      await saveAd({ data: { adId: ad.id, fields } })
      await refresh()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusyAdId('')
    }
  }

  async function regenerate(adId: string) {
    setBusyAdId(adId)
    setError('')
    try {
      await regenerateAd({ data: { adId } })
      await refresh()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusyAdId('')
    }
  }

  async function uploadImage(ad: EditableAd, file: File) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError('Image upload is too large. Keep uploads under 2 MB.')
      return
    }

    setBusyAdId(ad.id)
    setError('')
    try {
      const base64 = await readFileAsBase64(file)
      await uploadAdImage({
        data: {
          adId: ad.id,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          base64,
        },
      })
      await refresh()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusyAdId('')
    }
  }

  if (!bundle) {
    return (
      <main className="page-wrap px-4 py-12">
        <Link to="/" className="text-sm font-bold no-underline">
          Back
        </Link>
        <p className="mt-6 text-[var(--sea-ink-soft)]">
          {error || 'Loading project...'}
        </p>
      </main>
    )
  }

  const { project, profile, ads } = bundle

  return (
    <main className="page-wrap px-4 pb-12 pt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm font-bold no-underline">
          Back to projects
        </Link>
        <span className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-bold uppercase text-[var(--sea-ink-soft)]">
          {project.status} / {project.extractionStatus}
        </span>
      </div>

      <section className="rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-[0_22px_48px_rgba(23,58,64,0.1)] sm:p-7">
        <p className="island-kicker mb-2">Project</p>
        <h1 className="display-title m-0 text-3xl font-bold leading-tight text-[var(--sea-ink)] sm:text-5xl">
          {project.inputUrl}
        </h1>
        <div className="mt-4 grid gap-3 text-sm text-[var(--sea-ink-soft)] sm:grid-cols-3">
          <InfoPill label="Latency" value={`${project.elapsedMs}ms`} />
          <InfoPill label="Cap" value={project.costNote ?? 'Capped'} />
          <InfoPill label="Partial reason" value={project.partialReason ?? 'None'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold uppercase text-[var(--sea-ink-soft)]">
          <span className="rounded-full border border-[var(--line)] bg-white/45 px-3 py-1 dark:bg-white/5">
            Evidence saved
          </span>
          <span className="rounded-full border border-[var(--line)] bg-white/45 px-3 py-1 dark:bg-white/5">
            Overrides isolated
          </span>
          <span className="rounded-full border border-[var(--line)] bg-white/45 px-3 py-1 dark:bg-white/5">
            Regenerate one ad
          </span>
        </div>
        {project.errorMessage ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {project.errorMessage}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </p>
        ) : null}
      </section>

      {profile ? (
        <section className="mt-7 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-2xl border border-[var(--line)] bg-white/45 p-5 dark:bg-white/5">
            <p className="island-kicker mb-3">Brand profile</p>
            <ProfileRow label="What company does" value={profile.companyDescription} />
            <ProfileRow label="Audience" value={profile.audience} />
            <ProfileRow label="Value proposition" value={profile.valueProposition} />
            <ProfileRow label="Tone" value={profile.tone} />
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.colors.length > 0 ? (
                profile.colors.map((color) => (
                  <span
                    key={color}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-xs font-bold"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                    {color}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[var(--sea-ink-soft)]">
                  Colors not found
                </span>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--line)] bg-white/45 p-5 dark:bg-white/5">
            <p className="island-kicker mb-3">Evidence</p>
            <div className="max-h-[360px] space-y-3 overflow-auto pr-1">
              {profile.rawEvidence.map((item) => (
                <blockquote
                  key={`${item.source}-${item.text}`}
                  className="m-0 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3"
                >
                  <strong className="block text-xs uppercase text-[var(--kicker)]">
                    {item.source}
                  </strong>
                  <span className="text-sm leading-6 text-[var(--sea-ink-soft)]">
                    {item.text}
                  </span>
                </blockquote>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-4">
          <p className="island-kicker mb-1">Editable previews</p>
          <h2 className="m-0 text-2xl font-bold text-[var(--sea-ink)]">
            Ads
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {ads.map((ad) => (
            <AdEditor
              key={ad.id}
              ad={ad}
              draft={drafts[ad.id] ?? adToDraft(ad)}
              images={images}
              busy={busyAdId === ad.id}
              onChange={(draft) => setDrafts((prev) => ({ ...prev, [ad.id]: draft }))}
              onSave={() => save(ad)}
              onRegenerate={() => regenerate(ad.id)}
              onUpload={(file) => uploadImage(ad, file)}
            />
          ))}
        </div>
      </section>
    </main>
  )
}

function AdEditor(props: {
  ad: EditableAd
  draft: GeneratedAdFields
  images: string[]
  busy: boolean
  onChange: (draft: GeneratedAdFields) => void
  onSave: () => void
  onRegenerate: () => void
  onUpload: (file: File) => void
}) {
  const { ad, draft, images, busy, onChange, onSave, onRegenerate, onUpload } = props

  function update<TKey extends keyof GeneratedAdFields>(
    key: TKey,
    value: GeneratedAdFields[TKey],
  ) {
    onChange({ ...draft, [key]: value })
  }

  return (
    <article className="grid content-start gap-3 rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-3 shadow-[0_18px_38px_rgba(23,58,64,0.09)] sm:p-4">
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[#dfece7]">
        {draft.imageUrl ? (
          <img
            src={draft.imageUrl}
            alt={`Ad ${ad.slot} selected creative`}
            className="h-44 w-full object-cover sm:h-52"
          />
        ) : (
          <div className="flex h-44 items-center justify-center px-6 text-center text-sm font-semibold text-[var(--sea-ink-soft)] sm:h-52">
            No image found. Paste an image URL or choose a candidate if available.
          </div>
        )}
        <div className="space-y-2 p-3">
          <h3 className="m-0 text-xl font-extrabold leading-tight text-[var(--sea-ink)]">
            {draft.headline}
          </h3>
          <p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
            {draft.primaryText}
          </p>
          <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
            {draft.description}
          </p>
          <button className="rounded-lg bg-[var(--sea-ink)] px-4 py-2 text-sm font-bold text-white">
            {draft.cta}
          </button>
        </div>
      </div>

      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="island-kicker mb-1">Ad {ad.slot}</p>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Version {ad.version}
              {ad.userEditedFields.length > 0
                ? ` / edited: ${ad.userEditedFields.join(', ')}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-bold text-[var(--sea-ink)] disabled:opacity-60 dark:bg-white/10"
          >
            {busy ? 'Working...' : 'Regenerate'}
          </button>
        </div>

        <Field
          label="Creative idea"
          value={draft.creativeIdea}
          onChange={(value) => update('creativeIdea', value)}
        />
        <Field
          label="Primary text"
          value={draft.primaryText}
          multiline
          rows={2}
          onChange={(value) => update('primaryText', value)}
        />
        <Field
          label="Headline"
          value={draft.headline}
          onChange={(value) => update('headline', value)}
        />
        <Field
          label="Description"
          value={draft.description}
          onChange={(value) => update('description', value)}
        />
        <Field label="CTA" value={draft.cta} onChange={(value) => update('cta', value)} />
        <Field
          label="Image URL"
          value={draft.imageUrl}
          onChange={(value) => update('imageUrl', value)}
        />

        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--kicker)]">
            Upload image
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload(file)
              event.target.value = ''
            }}
            className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] dark:bg-[#14262b]"
          />
        </label>

        {images.length > 0 ? (
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-[var(--kicker)]">
              Swap candidate
            </label>
            <select
              value={draft.imageUrl}
              onChange={(event) => update('imageUrl', event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] dark:bg-[#14262b]"
            >
              <option value="">No image</option>
              {images.map((image) => (
                <option key={image} value={image}>
                  {image}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="mt-1 min-h-11 rounded-xl bg-[var(--lagoon-deep)] px-4 py-2 font-bold text-white disabled:opacity-60"
        >
          Save edits
        </button>
      </div>
    </article>
  )
}

function Field(props: {
  label: string
  value: string
  multiline?: boolean
  rows?: number
  onChange: (value: string) => void
}) {
  const shared =
    'w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--lagoon)] transition focus:ring-2 dark:bg-[#14262b]'

  return (
    <label>
      <span className="mb-1 block text-xs font-bold uppercase text-[var(--kicker)]">
        {props.label}
      </span>
      {props.multiline ? (
        <textarea
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          rows={props.rows ?? 3}
          className={shared}
        />
      ) : (
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className={shared}
        />
      )}
    </label>
  )
}

function InfoPill(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/50 p-3 dark:bg-white/5">
      <strong className="block text-xs uppercase text-[var(--kicker)]">{props.label}</strong>
      <span>{props.value}</span>
    </div>
  )
}

function ProfileRow(props: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] py-3 last:border-b-0">
      <strong className="block text-xs uppercase text-[var(--kicker)]">{props.label}</strong>
      <span className="text-sm leading-6 text-[var(--sea-ink-soft)]">{props.value}</span>
    </div>
  )
}

function adToDraft(ad: EditableAd): GeneratedAdFields {
  return {
    creativeIdea: ad.creativeIdea,
    primaryText: ad.primaryText,
    headline: ad.headline,
    description: ad.description,
    cta: ad.cta,
    imageUrl: ad.imageUrl,
  }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image file.'))
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.includes(',') ? value.split(',').at(1) ?? '' : value)
    }
    reader.readAsDataURL(file)
  })
}
