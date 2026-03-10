import { NextRequest, NextResponse } from "next/server"
import { splitImage } from "@/lib/splitter/algo"
import { detectGrid } from "@/lib/ai/fallback"
import type { SplitConfig } from "@/types"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const configStr = formData.get("config") as string | null

    if (!file || !configStr) {
      return NextResponse.json(
        { error: "missing file or config" },
        { status: 400 }
      )
    }

    const config: SplitConfig = JSON.parse(configStr)
    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || "image/jpeg"

    // Try AI detection when grid size is unknown (auto mode) or AI is requested
    let method: "ai" | "algo" = "algo"
    let aiConfidence: number | undefined
    let aiError: string | undefined
    let finalConfig = { ...config }

    if (config.useAI || config.rows === 0 || config.cols === 0) {
      const detection = await detectGrid(buffer, config, mimeType)

      method = detection.method
      aiConfidence = detection.confidence
      aiError = detection.aiError

      if (detection.method === "ai") {
        // Only run seam detection if AI confirmed there are visible separators.
        // For edge-to-edge collages (no separators) seam detection snaps to
        // photo-content edges and produces wrong splits.
        const keepSeams = detection.hasSeparator === true
        finalConfig = {
          ...config,
          rows: detection.rows,
          cols: detection.cols,
          auto: keepSeams,
        }
      } else if (detection.aiError && (finalConfig.rows === 0 || finalConfig.cols === 0)) {
        // AI was requested but failed, and we have no grid dimensions to fall back on.
        // Return early with a clear error rather than letting autoDetectGridSize fail silently.
        return NextResponse.json(
          { error: `Kimi AI failed: ${detection.aiError}. Switch to Manual mode and specify rows & cols.` },
          { status: 422 }
        )
      }
      // If algo fallback and rows/cols are provided, proceed with those dimensions
    }

    const { cells, grid } = await splitImage(buffer, finalConfig)

    return NextResponse.json({ cells, grid, method, aiConfidence, aiError })
  } catch (err) {
    console.error("Split error:", err)
    const msg = err instanceof Error ? err.message : "internal error"
    const isNoSeparator = msg === "no_separator_detected"
    return NextResponse.json(
      {
        error: isNoSeparator
          ? "Could not detect grid automatically — image has no visible separator lines. Switch to Manual mode and specify rows & cols, or enable Kimi AI."
          : msg,
      },
      { status: isNoSeparator ? 422 : 500 }
    )
  }
}
