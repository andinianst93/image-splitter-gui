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
    const isAutoMode = config.rows === 0 || config.cols === 0
    let finalConfig = {
      ...config,
      // Manual mode should use strict uniform slicing only.
      auto: isAutoMode ? config.auto : false,
    }

    // Auto mode: always try Kimi AI to detect grid size
    if (isAutoMode) {
      const detection = await detectGrid(buffer, { ...config, useAI: true }, mimeType)

      method = detection.method
      aiConfidence = detection.confidence
      aiError = detection.aiError

      if (detection.method === "ai") {
        // Only run seam detection if AI confirmed there are visible separators.
        const keepSeams = detection.hasSeparator === true
        finalConfig = {
          ...config,
          rows: detection.rows,
          cols: detection.cols,
          auto: keepSeams,
        }
      } else if (detection.aiError) {
        // AI failed: keep auto mode and let algorithmic detection handle fallback.
        // We still return aiError in response so UI can show diagnostics.
        finalConfig = {
          ...finalConfig,
          rows: config.rows,
          cols: config.cols,
        }
      }
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
          ? "Could not detect grid automatically — no visible separator lines found. Switch to Manual mode and specify rows & cols."
          : msg,
      },
      { status: isNoSeparator ? 422 : 500 }
    )
  }
}
