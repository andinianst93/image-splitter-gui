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

/** Ensures seams are integers, clamped to [1, dim-1], sorted, min-gap 1.
 *  Falls back to uniform split if the result is invalid. */
function sanitizeSeams(
  seams: number[],
  dimension: number,
  count: number
): number[] {
  const uniform = () =>
    Array.from({ length: count - 1 }, (_, i) =>
      Math.round((dimension * (i + 1)) / count)
    )

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
    const depths = calculateTrimDepths(
      raw.data,
      raw.width,
      raw.height,
      raw.channels,
      config.trimTolerance
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

  if (config.scale > 1.0) {
    const meta = await sharp(cellBuffer).metadata()
    cellBuffer = await sharp(cellBuffer)
      .resize(
        Math.round(meta.width! * config.scale),
        Math.round(meta.height! * config.scale),
        { kernel: "lanczos3" }
      )
      .toBuffer()
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

  if (config.auto || rows === 0 || cols === 0) {
    const raw = await getRawData(imageBuffer)

    if (rows === 0 || cols === 0) {
      const detected = autoDetectGridSize(
        raw.data,
        raw.width,
        raw.height,
        raw.channels
      )
      if (!detected.reliable) {
        throw new Error(
          "no_separator_detected"
        )
      }
      if (rows === 0) rows = detected.rows
      if (cols === 0) cols = detected.cols
    }

    if (config.auto && rows > 1) {
      horizSeams = detectHorizSeams(
        raw.data,
        raw.width,
        raw.height,
        raw.channels,
        rows
      )
    }
    if (config.auto && cols > 1) {
      vertSeams = detectVertSeams(
        raw.data,
        raw.width,
        raw.height,
        raw.channels,
        cols
      )
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

  const format: "png" | "jpeg" = config.quality === 0 ? "png" : "jpeg"
  const cells: Cell[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const y = rowPositions[r]
      const h = rowPositions[r + 1] - rowPositions[r]
      const x = colPositions[c]
      const w = colPositions[c + 1] - colPositions[c]

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
