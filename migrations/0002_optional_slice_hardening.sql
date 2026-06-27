CREATE TABLE IF NOT EXISTS extraction_cache (
  normalized_url TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  partial_reason TEXT,
  evidence_json TEXT NOT NULL,
  images_json TEXT NOT NULL,
  colors_json TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
