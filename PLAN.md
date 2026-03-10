# Plan: image-splitter-ui (Web App)

> **Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · shadcn/ui · Sharp · Kimi API

---

## Status

- [ ] Phase 1 — Foundation (shadcn setup, upload UI)
- [ ] Phase 2 — Core Split (Sharp + seam algorithm)
- [ ] Phase 3 — AI Integration (Kimi API → auto grid detection)
- [ ] Phase 4 — Reassemble (drag-to-reorder + rebuild collage)
- [ ] Phase 5 — Download (ZIP + individual cells)

---

## Architecture

```
app/
  page.tsx                    ← Upload + options form (main page)
  api/
    split/route.ts            ← POST: image → split cells (AI or algo)
    reassemble/route.ts       ← POST: cells + layout → collage image
    download/route.ts         ← GET: ZIP of all cells
components/
  upload-zone.tsx             ← Drag & drop upload area
  split-options.tsx           ← Rows/cols, auto mode, trim, quality, scale
  cell-grid.tsx               ← Preview grid of split results
  reassemble-board.tsx        ← Drag-to-reorder cells before reassembly
lib/
  splitter/
    algo.ts                   ← Seam detection + grid split algorithm (Sharp)
    seams.ts                  ← detectHorizSeams / detectVertSeams (energy-based)
    trimmer.ts                ← trimBorderOnce (15% depth cap)
  ai/
    kimi.ts                   ← Kimi API client (grid detection via vision)
    fallback.ts               ← Orchestrator: try Kimi → fallback to algo
  image-utils.ts              ← Format support, Sharp helpers
  zip.ts                      ← JSZip: bundle cells for download
types/
  index.ts                    ← SplitConfig, Cell, GridLayout, SplitResult
```

---

## Data Flow

### Split flow
```
User uploads image
  → POST /api/split { image, config }
    → fallback.ts:
        1. Try kimi.ts → analyzeGrid(image) → { rows, cols, seams }
        2. If Kimi unavailable / error → algo.ts → detectGrid(image)
    → algo.ts: Split image with Sharp extract() into cells[]
    → Per cell: trimBorderOnce (if trim=true) → upscale (if scale>1)
    → Return: Cell[] as base64/blob + metadata
  ← UI renders cell-grid.tsx with preview thumbnails
```

### Reassemble flow
```
User drag-reorders cells in reassemble-board.tsx
  → POST /api/reassemble { cells[], rows, cols, quality }
    → Sharp composite() to stitch cells into new collage
  ← Return assembled image for preview + download
```

---

## Types

```ts
interface SplitConfig {
  rows: number          // 0 = auto
  cols: number          // 0 = auto
  auto: boolean         // AI or seam detection
  trim: boolean
  trimTolerance: number // default 60
  quality: number       // 0 = PNG, 1-100 = JPEG
  scale: number         // 1.0 = no upscale
  useAI: boolean        // try Kimi first (default true)
}

interface Cell {
  id: string
  index: number         // original position (row*cols + col)
  row: number
  col: number
  dataUrl: string       // preview (compressed)
  buffer: Buffer        // full-res for download/reassemble
  width: number
  height: number
  format: "png" | "jpeg" | "webp"
}

interface GridLayout {
  rows: number
  cols: number
  order: number[]       // cell indices in new order
}

interface SplitResult {
  cells: Cell[]
  grid: { rows: number; cols: number }
  method: "ai" | "algo" // which method was used
  aiConfidence?: number
}
```

---

## Phase 1 — Foundation

**Goal:** App runnable with upload UI and shadcn components.

Tasks:
1. Install shadcn/ui: `npx shadcn@latest init`
2. Add components: `card`, `button`, `input`, `slider`, `badge`, `progress`, `tabs`, `dialog`, `sonner`, `separator`, `tooltip`
3. Install deps: `sharp`, `jszip`, `@types/sharp`
4. Create `upload-zone.tsx` — drag & drop with file validation (image MIME types)
5. Create `split-options.tsx` — form: rows/cols inputs, auto toggle, trim toggle, quality slider, scale slider, AI toggle
6. `app/page.tsx` — wire upload + options, show placeholder for results

---

## Phase 2 — Core Split (Algorithm)

**Goal:** Working split via seam detection, no AI dependency.

Tasks:
1. `lib/splitter/seams.ts` — port energy-based seam detection from Go:
   - `detectHorizSeams(imgBuffer, rows)` → `number[]` (y positions)
   - `detectVertSeams(imgBuffer, cols)` → `number[]` (x positions)
   - Row energy = sum |brightness[y] - brightness[y+1]| across all x
   - Box filter smooth → find peak energy in search window → snap to gap center
2. `lib/splitter/trimmer.ts` — `trimBorderOnce(region, tol, maxDepthFraction=0.15)`:
   - 8 candidate border colors (4 corners + 4 midpoints)
   - Walk inward per side, 15% depth cap, bilateral requirement
3. `lib/splitter/algo.ts` — `splitImage(buffer, config)`:
   - Sharp `.metadata()` for dimensions
   - If rows/cols provided: uniform grid split with Sharp `.extract()`
   - If auto: run seam detection first, then split on seam boundaries
   - Per cell: optional trim, optional upscale (Sharp `.resize()` CatmullRom)
   - Return `Cell[]`
4. `app/api/split/route.ts` — POST handler:
   - Receive `multipart/form-data` (image + config JSON)
   - Route to `fallback.ts` (which in Phase 2 just calls algo.ts)
   - Return `SplitResult` as JSON
5. `components/cell-grid.tsx` — responsive grid of thumbnails with index labels

---

## Phase 3 — AI Integration (Kimi)

**Goal:** Kimi Vision API detects grid structure; algo is fallback.

Kimi Code API details:
- Base URL: `https://api.kimi.com/coding/v1` (OpenAI-compatible)
- Model: `kimi-k2.5` (native multimodal, supports image input)
- Auth: `KIMI_CODE_API_KEY` env var
- Request: send collage image as base64 + prompt asking for grid structure
- Response: parse JSON `{ rows, cols, seamPositions?, separatorColor? }`

Tasks:
1. `lib/ai/kimi.ts`:
   - `analyzeGrid(imageBuffer, mimeType)` → `KimiGridResult | null`
   - Send image as base64 data URL in messages
   - Prompt: _"Analyze this collage image. Detect the grid layout (rows × cols), separator color (if any), and approximate seam positions as fractions. Return ONLY JSON: { rows, cols, hasSeperator, separatorColor, confidence }"_
   - Parse response strictly; return null if unparseable or low confidence
   - Set timeout 10s; catch network errors → return null
2. `lib/ai/fallback.ts`:
   - `detectGrid(buffer, config)`:
     - If `config.useAI`: try `kimi.analyzeGrid()` → if result & confidence > 0.7: use it
     - Otherwise: run seam detection algo
3. Update `api/split/route.ts` to use `fallback.ts`
4. `SplitResult.method` = `"ai"` or `"algo"` — show badge in UI
5. `.env.local` example: `KIMI_API_KEY=sk-...`

---

## Phase 4 — Reassemble

**Goal:** User can reorder cells and rebuild a collage.

Tasks:
1. Install `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-reorder
2. `components/reassemble-board.tsx`:
   - Sortable grid of cell thumbnails
   - "New layout" inputs: rows × cols (can differ from original)
   - "Reassemble" button
3. `app/api/reassemble/route.ts`:
   - Receive `{ cells: Cell[], layout: GridLayout, quality }`
   - Use Sharp `.composite()` to place cells in order onto blank canvas
   - Support different output grid (e.g. 4×2 → 2×4)
   - Return assembled image as base64 or blob
4. Show reassembled preview in dialog with download button

---

## Phase 5 — Download

**Goal:** Download individual cells or all as ZIP.

Tasks:
1. `lib/zip.ts` — `createZip(cells: Cell[])` using JSZip → `Buffer`
2. `app/api/download/route.ts`:
   - GET `?id=all` → ZIP of all cells
   - GET `?id=<cellId>` → single cell file
3. In `cell-grid.tsx`: per-cell download button + "Download All (ZIP)" button
4. Filename convention: `cell_r{row}_c{col}.{ext}` (e.g. `cell_r1_c2.png`)

---

## Supported Formats

Sharp supports all these natively:
| Input | Output |
|-------|--------|
| JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG | JPEG (quality 1-100), PNG, WebP, AVIF |

Output format determined by `quality` setting:
- `quality = 0` → PNG (lossless)
- `quality 1–100` → JPEG
- Future: WebP option via format selector

---

## UI/UX Flow

```
[1] Upload page
    └─ Drop zone + "Choose file" button
    └─ Options: Auto (AI/algo) | Manual (rows×cols)
                Trim toggle | Quality slider | Scale slider
                "AI-powered" badge (shows Kimi status)

[2] Processing
    └─ Progress bar with step labels: "Uploading → Analyzing → Splitting → Done"
    └─ Method badge: "AI (Kimi)" or "Algorithm"

[3] Results
    └─ Grid preview of all cells
    └─ Per-cell: preview, dimensions, download button
    └─ "Download All (ZIP)" button
    └─ "Reassemble" tab

[4] Reassemble (tab)
    └─ Drag-to-reorder grid
    └─ New layout inputs
    └─ "Build Collage" button → preview dialog → download
```

---

## Environment Variables

```env
KIMI_CODE_API_KEY=sk-...     # Kimi Code API key (optional; falls back to algo if missing)
```

---

## Dependencies to Add

| Package | Purpose |
|---------|---------|
| `sharp` | HD image processing, extract, resize, composite |
| `jszip` | ZIP bundle for download |
| `@dnd-kit/core` | Drag-and-drop for reassemble |
| `@dnd-kit/sortable` | Sortable grid for reassemble |
| shadcn/ui components | UI: card, button, slider, tabs, dialog, badge, progress, sonner |

> Note: `sharp` is already present in `node_modules` (from initial setup).
> Do NOT add other AI SDKs — use native `fetch` for Kimi (OpenAI-compatible REST).

---

## Key Constraints

- All image processing server-side (API routes) — never send raw large buffers to client
- Client previews use compressed thumbnails (max 400px wide) from server
- Full-res buffers stay server-side until download requested
- No temporary files on disk — all in-memory with Sharp buffers
- AI is optional: app fully functional without `KIMI_API_KEY`
- HD quality: Sharp defaults to no quality loss for PNG; JPEG quality is user-controlled

---

## Known Challenges

1. **Large images in API routes**: Next.js default body limit 4MB. Need `export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }` or use streaming.
2. **Kimi seam positions**: AI may return rough fractions, not exact pixels. Need to snap to nearest gap center (same as algo's `snapToGapCenter`).
3. **Edge-to-edge collages**: No separator → AI may struggle. Fallback to energy-based seam detection.
4. **GIF/animated**: Sharp only processes first frame. Acceptable limitation.
