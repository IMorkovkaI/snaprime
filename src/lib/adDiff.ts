import type { EditableAd, GeneratedAdFields } from '../server/domain'

export function diffAdDraft(
  ad: Pick<EditableAd, 'generated'>,
  draft: GeneratedAdFields,
): Partial<GeneratedAdFields> {
  const fields: Partial<GeneratedAdFields> = {}

  addIfChanged(fields, 'creativeIdea', draft, ad.generated)
  addIfChanged(fields, 'primaryText', draft, ad.generated)
  addIfChanged(fields, 'headline', draft, ad.generated)
  addIfChanged(fields, 'description', draft, ad.generated)
  addIfChanged(fields, 'cta', draft, ad.generated)
  addIfChanged(fields, 'imageUrl', draft, ad.generated)

  return fields
}

function addIfChanged(
  fields: Partial<GeneratedAdFields>,
  key: keyof GeneratedAdFields,
  draft: GeneratedAdFields,
  generated: GeneratedAdFields,
) {
  if (draft[key] !== generated[key]) {
    fields[key] = draft[key]
  }
}
