# Snaprime URL to Ad Previews

Paste a website URL. The app extracts what it can from that page, builds a small brand profile from saved evidence, and generates 1-3 editable ad previews. Edits persist. Regenerating one ad does not wipe out the others or overwrite fields the user already changed.

Deployed app: https://snaprime.imarkovychi.workers.dev

## What Is Working

- Home page with URL input.
- Project page with extraction status, brand profile, evidence snippets, and editable ads.
- Cloudflare D1 persistence for projects, profiles, ads, and extraction cache.
- Cloudflare Browser Rendering is tried first for JS-rendered pages.
- Plain HTML fallback is stored as a partial extraction when rendering is unavailable.
- If no usable image candidates are found, Browser Rendering screenshot is tried as a small banner fallback.
- Workers AI generates the profile/ad JSON when the `AI` binding is available.
- Deterministic fallback keeps the demo usable when AI returns invalid JSON or is unavailable.
- Ad text, image URL swaps, candidate image swaps, and image uploads persist as overrides.
- Regenerating one ad updates that ad's generated fields only. User overrides stay intact.

Images are not generated from scratch. The app uses images extracted from the submitted page, pasted image URLs, or uploaded files.

## Stack

- TanStack Start
- TypeScript
- Cloudflare Workers deploy
- Cloudflare D1 for relational persistence
- Cloudflare R2-ready image storage path, with a D1 fallback while R2 is disabled on this account
- Cloudflare Workers AI
- Cloudflare Browser Rendering REST API

## Cloudflare Setup

The D1 database is already configured in `wrangler.jsonc` as `snaprime-db`, and migrations have been applied locally and remotely.

For a fresh account:

```bash
pnpm wrangler d1 create snaprime-db
pnpm wrangler d1 migrations apply snaprime-db --remote
```

Browser Rendering needs an account id and API token:

```bash
pnpm wrangler secret put CLOUDFLARE_BROWSER_RENDERING_API_TOKEN
```

`CLOUDFLARE_ACCOUNT_ID`, `AI_MODEL`, and `EXTRACTION_MAX_MS` are set in `wrangler.jsonc`. Workers AI uses the `AI` binding.

R2 is Cloudflare's object storage, similar to S3. Image upload is written to use an optional R2 binding named `UPLOADS`. This account currently has R2 disabled; `pnpm wrangler r2 bucket create snaprime-uploads` returned Cloudflare API code `10042`. Until R2 is enabled, small image uploads fall back to persisted D1 data URLs so the deployed demo still works.

## Run It

```bash
pnpm install
pnpm generate-routes
pnpm run build
pnpm run deploy
```

Local D1:

```bash
pnpm wrangler d1 migrations apply snaprime-db --local
pnpm dev
```

## Data Model

- `projects`: URL, status, extraction status, errors, partial reason, elapsed time, and cost note.
- `extraction_cache`: successful rendered/plain extraction results keyed by normalized URL.
- `brand_profiles`: normalized profile fields plus colors, image candidates, and raw evidence JSON.
- `ads`: generated fields and override fields stored separately.

The ad display rule is simple: `override ?? generated`. That is the main guardrail that lets regeneration update one generated ad without erasing user edits.

## Extraction Flow

1. Normalize and validate the URL.
2. Block local/private hosts and DNS results that resolve to private IPs.
3. Try Cloudflare Browser Rendering for rendered markdown/content.
4. Fall back to plain HTML fetch when rendering is unavailable.
5. If no `og:image` or useful `<img>` candidates are found, try a rendered screenshot fallback.
6. Store evidence snippets, image candidates, colors, status, and partial reason.
7. Cache successful extraction results by normalized URL.

The extractor is intentionally shallow: one submitted URL, no crawling, and a default 12 second cap.

Screenshot fallback is conditional. Normal image candidates still win, and oversized screenshots are skipped instead of being stored in D1.

One real failure found during testing was `https://www.zlatestranky.sk/`. The site returned `403` to the app's old bot-style plain-fetch User-Agent, even though a normal browser request returned `200`. The fix was to keep Browser Rendering as the first attempt, but make the plain HTML fallback use browser-like `Accept`, `Accept-Language`, and `User-Agent` headers. I added a regression test so the fallback does not drift back to the blocked bot header.

## Ad Image Decision Flow

The app does not generate new images. It chooses the best available image source in this order:

1. Prefer `og:image`, because sites usually set it for social/ad previews.
2. Score visible `<img>` candidates by size and useful words like `hero`, `product`, `brand`, `cover`, or `social`.
3. Penalize obvious bad fits: favicons, sprites, tracking pixels, tiny icons, SVGs, and logo-only assets.
4. Deduplicate normalized URLs and keep the best candidates.
5. If the page has no usable image candidates, try a rendered `1200x630` screenshot fallback.
6. If the screenshot is too large for the D1 fallback cap, skip it and keep the project partial instead of storing a huge blob.
7. Pass the final image candidate list into ad generation. The deterministic fallback assigns image 1/2/3 to ad 1/2/3 when available.
8. User choice always wins: pasted URLs, candidate swaps, and uploads are saved as ad overrides and are not erased by regenerating one ad.

## AI Flow

The app prompts in two stages:

1. Normalize a brand profile from stored evidence.
2. Generate 1-3 ads from that profile and evidence.

Prompts require strict JSON and evidence-only claims. Unsupported facts should become `not found` or stay generic. If Workers AI fails or returns invalid JSON, the app falls back to deterministic ads so the project still reaches a usable state.

## What I Deliberately Left Out

- Multi-page crawling;
- Auth or multi-user isolation;
- Background jobs and queues;
- Production R2 storage until R2 is enabled for the account;
- Advanced logo detection;
- Any styling beside TanStack basic visuals;
- Perceptual image deduplication;
- Full Playwright/CDP hero-section analysis;
- Pixel-perfect Meta/Google previews.

Those are useful, but they are not needed to prove the assignment spine.

## Manual Checks

Manually tested through the deployed UI:

- Static marketing URL;
- JS-rendered URL;
- Broken/unreadable URL;
- Edit persistence after refresh;
- Regenerate one ad without modifying unrelated ads.

## Verification

These pass locally:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm run build
```

The deployed `/` route returns HTTP 200.

## AI-Agent Note

Codex and Claude were both used during the build. Claude helped shape the first review/planning pass; Codex handled the implementation loop, debugging, verification, and deployment. I framed the agents as a senior fullstack engineering reviewer rather than a code generator, which kept the conversation focused on risk, sequencing, and what to cut.

I also kept project instructions in markdown instead of relying on chat memory:

- `AGENTS.md` held the overall assignment goal, stack, risks, and build priorities.
- `docs/architecture.md` tracked the chosen architecture and data model.
- `docs/todo-list.md` tracked what was done, what was blocked, and what still needed manual testing.

That setup made the agent more useful: `AGENTS.md` gave the general approach, while the two docs gave concrete implementation details and a running task monitor. The main correction I had to keep making was scope control. The assignment rewards a deployed vertical slice, so I chose boring fallbacks and explicit deferrals over a larger system that would look better on paper but be easier to break during review.
