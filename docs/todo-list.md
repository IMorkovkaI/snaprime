# Todo / Cut List

## Must Do Before Submission

- Done: D1 `database_id` is configured in `wrangler.jsonc`.
- Done: D1 migration applied locally and remotely.
- Done: deployed with `pnpm run deploy`.
- Done: deployed Cloudflare URL added to `README.md`.
- Done: tested one static URL, one JS-rendered URL, and one broken URL through the deployed UI.

## Nice If Time Remains

- Done: image upload is implemented; it uses R2 when an `UPLOADS` binding exists and falls back to a small D1 data URL when R2 is not enabled.
- Blocked by account config: `pnpm wrangler r2 bucket create snaprime-uploads` returned Cloudflare API code `10042` asking to enable R2 in the dashboard - no need for testing task.
- Done: add a small extraction cache keyed by normalized URL.
- Done: add deeper SSRF checks with DNS/IP resolution before rendered/plain fetch.
- Done: add image dedupe and dimension scoring.
- Done: add rendered screenshot fallback when no useful image candidates are found.
- Done: add a simple test around saving only changed ad fields.
