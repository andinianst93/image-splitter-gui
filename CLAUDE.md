# CLAUDE.md — image-splitter-ui

Instructions for Claude when working in this repository.

## Project

Web-based image splitter built with Next.js. Users upload a collage image, split it into individual cells (AI-powered via Kimi or algorithmic fallback), optionally reassemble with reordering, and download results in HD quality.

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Image processing:** Sharp (server-side only)
- **AI:** Kimi API (Moonshot AI, vision model) — optional, falls back to algorithm

## Package Structure

```
app/
  page.tsx                    ← Main page (upload + options)
  api/
    split/route.ts            ← POST: split image
    reassemble/route.ts       ← POST: reassemble cells into collage
    download/route.ts         ← GET: download cells or ZIP
components/
  upload-zone.tsx             ← Drag & drop file upload
  split-options.tsx           ← Config form (rows, cols, trim, quality, scale, AI toggle)
  cell-grid.tsx               ← Preview grid of split cells
  reassemble-board.tsx        ← Drag-to-reorder for reassembly
lib/
  splitter/
    algo.ts                   ← Sharp-based split + seam detection
    seams.ts                  ← Energy-based seam detection algorithm
    trimmer.ts                ← trimBorderOnce (15% depth cap)
  ai/
    kimi.ts                   ← Kimi Vision API client
    fallback.ts               ← Try AI → fallback to algo
  image-utils.ts              ← Sharp helpers, format detection
  zip.ts                      ← JSZip: create ZIP bundle
types/
  index.ts                    ← SplitConfig, Cell, GridLayout, SplitResult
```

## Dependencies

```
next, react, react-dom        (existing)
tailwindcss v4                (existing)
sharp                         (existing in node_modules)
jszip                         (to add)
@dnd-kit/core                 (to add, for reassemble drag-drop)
@dnd-kit/sortable             (to add)
shadcn/ui components          (to add via npx shadcn@latest add ...)
```

## Common Commands

```bash
npm run dev      # development server
npm run build    # production build
npm run lint     # eslint
```

## Environment Variables

```env
KIMI_CODE_API_KEY=sk-...   # Kimi Code API key (optional — app works without it)
```

## Conventions

- All image processing runs **server-side** (API routes) — never in the browser
- Client only receives compressed thumbnails (max ~400px); full-res stays server-side
- All Sharp operations are **in-memory** — no temp files written to disk
- `quality = 0` → PNG output (lossless); `quality 1–100` → JPEG
- AI is fully optional: if `KIMI_API_KEY` missing or Kimi returns error → silently use algo
- Kimi API is OpenAI-compatible — use native `fetch`, no SDK needed
- shadcn components go in `components/ui/` (auto-managed by shadcn CLI)
- Custom components go in `components/` (not `components/ui/`)

## Seam Detection Algorithm (algo)

Ported from the Go CLI version:
1. Row energy = sum |brightness[y] - brightness[y+1]| across all x pixels
2. Box filter (5px) to smooth noise
3. For each seam i: search ±25% around expected position, pick peak energy row
4. Snap to center of nearest uniform-color gap (`snapToGapCenter`)

## Trim Algorithm (trimBorderOnce)

Single-pass, max depth = 15% of image dimension per side:
1. Try 8 candidate border colors (4 corners + 4 edge midpoints)
2. Accept first near-neutral candidate (chromaSum ≤ 30) satisfying at least one full edge
3. Walk inward per side → trim depths
4. 15% depth cap per side; bilateral requirement (both sides of axis must qualify)
5. Minimum result 10×10 px

## Do Not

- Do not run image processing in the browser (Canvas API) — always server-side via Sharp
- Do not add AI SDKs (openai, anthropic packages etc.) — use native fetch for Kimi REST API
- Do not write temp files to disk during image processing
- Do not add external dependencies without discussing first
- Do not expose `KIMI_API_KEY` to the client
