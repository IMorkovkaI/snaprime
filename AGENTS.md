# Snaprime Take-home Assignment

## Goal
Build a standalone app where user enters a website URL and gets 1–3 editable ad previews generated from extracted brand/profile data.

## Core Flow
1. User enters URL.
2. App extracts brand profile:
   - what company does
   - target audience
   - value proposition
   - tone/voice
   - color palette
   - candidate images
3. App generates 1–3 ads:
   - creative idea
   - primary text
   - headline
   - description
   - CTA
   - chosen image
4. User can:
   - edit ad text
   - swap/upload image
   - regenerate one ad
5. State must persist.
6. Deploy to Cloudflare.

## Required Stack
- TanStack Start
- TypeScript
- Cloudflare deploy
- Cloud DB
- AI SDK/model
- JS-rendered pages must work via rendering service or documented fallback

## Main Risks
- TanStack Start + Cloudflare deployment
- JS-rendered URL extraction
- AI hallucination
- persistence without overwriting edits
- time limit

## Build Priority
P0:
- deployed app
- URL input
- extraction
- AI generation
- editable preview
- persistence
- regenerate one ad

P1:
- image upload/swap
- graceful errors
- logs/cost cap

P2:
- caching(optional)
- SSRF protection
- color extraction quality
- image filtering/deduplication