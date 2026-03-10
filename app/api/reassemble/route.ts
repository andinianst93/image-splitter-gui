import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

export const maxDuration = 60

interface CellInput {
  id: string
  row: number
  col: number
  dataUrl: string
  width: number
  height: number
  format: string
}

interface ReassembleRequest {
  cells: CellInput[]
  rows: number
  cols: number
  quality: number
  gap: number
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(",")[1]
  return Buffer.from(base64, "base64")
}

export async function POST(req: NextRequest) {
  try {
    const body: ReassembleRequest = await req.json()
    const { cells, rows, cols, quality, gap = 0 } = body

    if (!cells?.length || rows < 1 || cols < 1) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 })
    }

    // Take only as many cells as the grid can fit
    const slotCount = rows * cols
    const usedCells = cells.slice(0, slotCount)

    // Decode buffers and get metadata
    const cellBuffers = await Promise.all(
      usedCells.map(async (cell) => {
        const buf = dataUrlToBuffer(cell.dataUrl)
        const meta = await sharp(buf).metadata()
        return { buf, width: meta.width!, height: meta.height! }
      })
    )

    // Compute per-column widths and per-row heights (max of cells in that col/row)
    const colWidths = Array(cols).fill(0) as number[]
    const rowHeights = Array(rows).fill(0) as number[]

    cellBuffers.forEach((cell, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      if (cell.width > colWidths[c]) colWidths[c] = cell.width
      if (cell.height > rowHeights[r]) rowHeights[r] = cell.height
    })

    // Accumulate x/y offsets
    const xOffsets = [0]
    for (let c = 0; c < cols - 1; c++) {
      xOffsets.push(xOffsets[c] + colWidths[c] + gap)
    }
    const yOffsets = [0]
    for (let r = 0; r < rows - 1; r++) {
      yOffsets.push(yOffsets[r] + rowHeights[r] + gap)
    }

    const totalWidth = xOffsets[cols - 1] + colWidths[cols - 1]
    const totalHeight = yOffsets[rows - 1] + rowHeights[rows - 1]

    // Build composite list
    const composites: sharp.OverlayOptions[] = await Promise.all(
      cellBuffers.map(async (cell, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        // Resize cell to match its slot dimensions
        const resized = await sharp(cell.buf)
          .resize(colWidths[c], rowHeights[r], {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer()
        return {
          input: resized,
          left: xOffsets[c],
          top: yOffsets[r],
        }
      })
    )

    // Create canvas and composite
    let pipeline = sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    }).composite(composites)

    let outputBuffer: Buffer
    let mimeType: string
    if (quality === 0) {
      outputBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer()
      mimeType = "image/png"
    } else {
      outputBuffer = await pipeline.flatten({ background: "#000000" }).jpeg({ quality }).toBuffer()
      mimeType = "image/jpeg"
    }

    const dataUrl = `data:${mimeType};base64,${outputBuffer.toString("base64")}`
    return NextResponse.json({
      dataUrl,
      width: totalWidth,
      height: totalHeight,
      format: quality === 0 ? "png" : "jpeg",
    })
  } catch (err) {
    console.error("Reassemble error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 }
    )
  }
}
