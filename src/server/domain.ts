export type ProjectStatus = 'processing' | 'ready' | 'partial' | 'failed'
export type ExtractionStatus = 'pending' | 'rendered' | 'plain-html' | 'failed'

export interface EvidenceSnippet {
  source: string
  text: string
}

export interface BrandProfile {
  id: string
  projectId: string
  companyDescription: string
  audience: string
  valueProposition: string
  tone: string
  colors: string[]
  images: string[]
  rawEvidence: EvidenceSnippet[]
}

export interface ProjectSummary {
  id: string
  inputUrl: string
  status: ProjectStatus
  extractionStatus: ExtractionStatus
  errorMessage: string | null
  partialReason: string | null
  costNote: string | null
  elapsedMs: number
  createdAt: string
  updatedAt: string
}

export interface GeneratedAdFields {
  creativeIdea: string
  primaryText: string
  headline: string
  description: string
  cta: string
  imageUrl: string
}

export interface EditableAd extends GeneratedAdFields {
  id: string
  projectId: string
  slot: number
  version: number
  generated: GeneratedAdFields
  overrides: Partial<GeneratedAdFields>
  userEditedFields: string[]
  createdAt: string
  updatedAt: string
}

export interface ProjectBundle {
  project: ProjectSummary
  profile: BrandProfile | null
  ads: EditableAd[]
}

export interface ExtractionResult {
  status: ExtractionStatus
  partialReason: string | null
  evidence: EvidenceSnippet[]
  images: string[]
  colors: string[]
  elapsedMs: number
}

export interface CreateProjectResult {
  id: string
}
