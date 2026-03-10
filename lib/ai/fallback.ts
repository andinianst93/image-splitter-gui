import { analyzeGrid } from "./kimi"
import type { SplitConfig } from "@/types"

export interface GridDetectionResult {
  rows: number
  cols: number
  confidence?: number
  hasSeparator?: boolean
  method: "ai" | "algo"
  aiError?: string
}

export async function detectGrid(
  imageBuffer: Buffer,
  config: SplitConfig,
  mimeType: string = "image/jpeg"
): Promise<GridDetectionResult> {
  if (config.useAI) {
    const hasApiKey =
      !!process.env.MOONSHOT_API_KEY ||
      !!process.env.KIMI_API_KEY ||
      !!process.env.KIMI_CODE_API_KEY

    if (!hasApiKey) {
      return {
        rows: config.rows,
        cols: config.cols,
        method: "algo",
        aiError:
          "Kimi API key not set (MOONSHOT_API_KEY / KIMI_API_KEY / KIMI_CODE_API_KEY)",
      }
    }

    const response = await analyzeGrid(imageBuffer, mimeType)

    if (response.ok) {
      return {
        rows: response.result.rows,
        cols: response.result.cols,
        confidence: response.result.confidence,
        hasSeparator:
          response.result.hasSeparator ?? response.result.hasSeperator,
        method: "ai",
      }
    }

    // AI failed — pass the reason back so UI can show it
    return {
      rows: config.rows,
      cols: config.cols,
      method: "algo",
      aiError: response.error.reason + (response.error.detail ? `: ${response.error.detail.slice(0, 120)}` : ""),
    }
  }

  return { rows: config.rows, cols: config.cols, method: "algo" }
}
