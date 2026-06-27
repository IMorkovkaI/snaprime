# Architecture

## Routes

- `/` - URL input and cost/fallback notes.
- `/projects/:id` - project status, brand profile, raw evidence, editable ad previews.

## Server Actions

- `createProjectAction` accepts a URL, creates the project, extracts evidence, stores the profile, and generates ads.
- `loadProjectAction` loads project, profile, and ads for the detail page.
- `saveAdAction` saves text/image overrides.
- `regenerateAdAction` regenerates generated fields for one ad only.
- `uploadAdImageAction` uploads an ad image through R2 when available, otherwise stores a small data URL override.

## Database

`projects`
- id
- input_url
- status
- extraction_status
- error_message
- partial_reason
- cost_note
- elapsed_ms
- created_at
- updated_at

`brand_profiles`
- id
- project_id
- company_description
- audience
- value_proposition
- tone
- colors_json
- images_json
- raw_evidence_json

`extraction_cache`
- normalized_url
- status
- partial_reason
- evidence_json
- images_json
- colors_json
- elapsed_ms
- created_at
- updated_at

`ads`
- id
- project_id
- slot
- generated text/image fields
- override text/image fields
- version
- user_edited_fields_json
- created_at
- updated_at

## Extraction

- Validate public `http`/`https` URLs.
- Block local, loopback, and obvious private hostnames.
- Verify DNS results before Browser Rendering/plain fetch and block private resolved IPs.
- Try Cloudflare Browser Rendering REST when account/token are configured.
- Fall back to plain HTML extraction and mark the project partial.
- Cache successful rendered/plain extraction results by normalized URL.
- Rank and dedupe image candidates with simple size/semantic scoring.
- If no image candidates are found, try a rendered screenshot fallback with a banner viewport and D1-safe size cap.
- Store raw evidence snippets so AI generation can be constrained by source text.

## Images

- Candidate images can be swapped from extracted URLs.
- Rendered screenshots can be used as fallback candidates when the page has no useful image URLs.
- Uploaded images persist as the ad's `imageUrl` override.
- The preferred storage path is an R2 `UPLOADS` binding. R2 is Cloudflare object storage, similar to S3.
- If R2 is not enabled, small uploads fall back to data URLs in D1 so the deployed demo remains usable.

## AI and Regeneration

- Use Cloudflare Workers AI binding when available.
- Fallback to deterministic generation when AI is unavailable or invalid JSON is returned.
- Prompts require strict JSON, evidence-only claims, and `not found` for unsupported profile facts.
- Regeneration loads the latest profile and current ad, then updates only that ad's generated fields.
