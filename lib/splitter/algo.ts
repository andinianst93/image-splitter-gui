import sharp from "sharp"
import {
  detectHorizSeams,
  detectVertSeams,
  autoDetectGridSize,
} from "./seams"
import { calculateTrimDepths } from "./trimmer"
import type { Cell, SplitConfig } from "@/types"

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function uniformSeams(dimension: number, count: number): number[] {
  if (count <= 1) return []
  return Array.from({ length: count - 1 }, (_, i) =>
    Math.floor((dimension * (i + 1)) / count)
  )
}

/** Ensures seams are integers, clamped to [1, dim-1], sorted, min-gap 1.
 *  Falls back to uniform split if the result is invalid. */
function sanitizeSeams(
  seams: number[],
  dimension: number,
  count: number
): number[] {
  const uniform = () => uniformSeams(dimension, count)

  if (count <= 1) return []

  let s = seams
    .map((v) => Math.max(1, Math.min(dimension - 1, Math.round(v))))
    .sort((a, b) => a - b)

  // Remove duplicates and ensure minimum 1-pixel gap between adjacent seams
  s = s.filter((v, i) => i === 0 || v - s[i - 1] >= 1)

  // Must have exactly count-1 seams after sanitization
  if (s.length !== count - 1) return uniform()

  // Ensure no resulting cell is zero-height/width
  const positions = [0, ...s, dimension]
  for (let i = 0; i < positions.length - 1; i++) {
    if (positions[i + 1] - positions[i] < 1) return uniform()
  }

  return s
}

async function getRawData(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  }
}

async function processCell(
  sourceBuffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
  config: SplitConfig
): Promise<{ buffer: Buffer; width: number; height: number }> {
  let cellBuffer = await sharp(sourceBuffer)
    .extract({ left: x, top: y, width: w, height: h })
    .toBuffer()

  if (config.trim) {
    const raw = await getRawData(cellBuffer)
    const maxTrimDepth = config.auto ? 0.15 : 0.45
    const depths = calculateTrimDepths(
      raw.data,
      raw.width,
      raw.height,
      raw.channels,
      config.trimTolerance,
      maxTrimDepth
    )
    if (depths) {
      cellBuffer = await sharp(cellBuffer)
        .extract({
          left: depths.left,
          top: depths.top,
          width: raw.width - depths.left - depths.right,
          height: raw.height - depths.top - depths.bottom,
        })
        .toBuffer()
    }
  }

  if (config.scale > 0) {
    const meta = await sharp(cellBuffer).metadata()
    const longest = Math.max(meta.width!, meta.height!)
    if (config.scale > longest) {
      const factor = config.scale / longest
      cellBuffer = await sharp(cellBuffer)
        .resize(
          Math.round(meta.width! * factor),
          Math.round(meta.height! * factor),
          { kernel: "lanczos3" }
        )
        .toBuffer()
    }
  }

  const meta = await sharp(cellBuffer).metadata()
  return { buffer: cellBuffer, width: meta.width!, height: meta.height! }
}

export async function splitImage(
  imageBuffer: Buffer,
  config: SplitConfig
): Promise<{ cells: Cell[]; grid: { rows: number; cols: number } }> {
  const meta = await sharp(imageBuffer).metadata()
  const imgWidth = meta.width!
  const imgHeight = meta.height!

  let { rows, cols } = config
  let horizSeams: number[] = []
  let vertSeams: number[] = []
  let hasSeparators = false

  if (config.auto || rows === 0 || cols === 0 || (rows > 0 && cols > 0)) {
    const raw = await getRawData(imageBuffer)

    // Always run separator detection to know if seam-snapping is safe
    const detected = autoDetectGridSize(
      raw.data,
      raw.width,
      raw.height,
      raw.channels
    )
    hasSeparators = detected.reliable

    if (rows === 0 || cols === 0) {
      if (!hasSeparators) {
        throw new Error("no_separator_detected")
      }
      if (rows === 0) rows = detected.rows
      if (cols === 0) cols = detected.cols
    }

    // Only run seam detection when the image actually has separator bands.
    // For edge-to-edge collages (no separators) the ±25% energy search window
    // picks up photo-internal edges and produces completely wrong split positions.
    if (hasSeparators) {
      if (rows > 1) {
        horizSeams = detectHorizSeams(
          raw.data,
          raw.width,
          raw.height,
          raw.channels,
          rows
        )
      }
      if (cols > 1) {
        vertSeams = detectVertSeams(
          raw.data,
          raw.width,
          raw.height,
          raw.channels,
          cols
        )
      }
    }
  }

  if (rows <= 0 || cols <= 0) {
    throw new Error(
      "could not determine grid size — specify rows and cols manually"
    )
  }

  // Clamp, sort, deduplicate seams; fall back to uniform if invalid
  horizSeams = sanitizeSeams(horizSeams, imgHeight, rows)
  vertSeams = sanitizeSeams(vertSeams, imgWidth, cols)

  const rowPositions = [0, ...horizSeams, imgHeight]
  const colPositions = [0, ...vertSeams, imgWidth]
  // Aggressive cleanup for separator-based collages to avoid leftover border pixels.
  const seamPadding = hasSeparators && !config.trim ? 6 : 0

  const format: "png" | "jpeg" = config.quality === 0 ? "png" : "jpeg"
  const cells: Cell[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rawTop = rowPositions[r]
      const rawBottom = rowPositions[r + 1]
      const rawLeft = colPositions[c]
      const rawRight = colPositions[c + 1]

      const maxPadY = Math.max(0, Math.floor((rawBottom - rawTop - 1) / 2))
      const maxPadX = Math.max(0, Math.floor((rawRight - rawLeft - 1) / 2))
      const padY = Math.min(seamPadding, maxPadY)
      const padX = Math.min(seamPadding, maxPadX)

      const y0 = rawTop + padY
      const y1 = rawBottom - padY
      const x0 = rawLeft + padX
      const x1 = rawRight - padX

      const y = Math.max(0, y0)
      const x = Math.max(0, x0)
      const h = Math.max(1, y1 - y)
      const w = Math.max(1, x1 - x)

      const { buffer, width, height } = await processCell(
        imageBuffer,
        x,
        y,
        w,
        h,
        config
      )

      let outputBuffer: Buffer
      if (config.quality === 0) {
        outputBuffer = await sharp(buffer).png({ compressionLevel: 6 }).toBuffer()
      } else {
        outputBuffer = await sharp(buffer)
          .jpeg({ quality: config.quality })
          .toBuffer()
      }

      const dataUrl = `data:image/${format};base64,${outputBuffer.toString("base64")}`

      cells.push({
        id: generateId(),
        index: r * cols + c,
        row: r,
        col: c,
        dataUrl,
        width,
        height,
        format,
      })
    }
  }

  return { cells, grid: { rows, cols } }
}
