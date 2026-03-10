import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

export const maxDuration = 60

interface CellInput {
  dataUrl: string
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

    const widths = cellBuffers.map((cell) => cell.width).sort((a, b) => a - b)
    const heights = cellBuffers.map((cell) => cell.height).sort((a, b) => a - b)
    const minWidth = widths[0]
    const maxWidth = widths[widths.length - 1]
    const minHeight = heights[0]
    const maxHeight = heights[heights.length - 1]
    const slotWidth = maxWidth
    const slotHeight = maxHeight
    const nearUniform = maxWidth - minWidth <= 2 && maxHeight - minHeight <= 2

    // Accumulate x/y offsets
    const xOffsets = [0]
    for (let c = 0; c < cols - 1; c++) {
      xOffsets.push(xOffsets[c] + slotWidth + gap)
    }
    const yOffsets = [0]
    for (let r = 0; r < rows - 1; r++) {
      yOffsets.push(yOffsets[r] + slotHeight + gap)
    }

    const totalWidth = xOffsets[cols - 1] + slotWidth
    const totalHeight = yOffsets[rows - 1] + slotHeight

    // Build composite list
    const composites: sharp.OverlayOptions[] = await Promise.all(
      cellBuffers.map(async (cell, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        const resized = await sharp(cell.buf)
          .resize(
            slotWidth,
            slotHeight,
            nearUniform
              ? { fit: "fill" }
              : {
                  fit: "contain",
                  position: "centre",
                  background: { r: 255, g: 255, b: 255, alpha: 0 },
                }
          )
          .toBuffer()
        return {
          input: resized,
          left: xOffsets[c],
          top: yOffsets[r],
        }
      })
    )

    // Create canvas and composite
    const pipeline = sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    }).composite(composites)

    let outputBuffer: Buffer
    let mimeType: string
    if (quality === 0) {
      outputBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer()
      mimeType = "image/png"
    } else {
      outputBuffer = await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer()
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
