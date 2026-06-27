CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  input_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  partial_reason TEXT,
  cost_note TEXT,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  company_description TEXT NOT NULL,
  audience TEXT NOT NULL,
  value_proposition TEXT NOT NULL,
  tone TEXT NOT NULL,
  colors_json TEXT NOT NULL,
  images_json TEXT NOT NULL,
  raw_evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  creative_idea_generated TEXT NOT NULL,
  primary_text_generated TEXT NOT NULL,
  headline_generated TEXT NOT NULL,
  description_generated TEXT NOT NULL,
  cta_generated TEXT NOT NULL,
  image_url_generated TEXT,
  creative_idea_override TEXT,
  primary_text_override TEXT,
  headline_override TEXT,
  description_override TEXT,
  cta_override TEXT,
  image_url_override TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  user_edited_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_project_slot ON ads(project_id, slot);
