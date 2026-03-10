import sharp from "sharp"

export interface KimiGridResult {
  rows: number
  cols: number
  confidence: number
  hasSeperator?: boolean
  hasSeparator?: boolean
  separatorColor?: string
}

export interface KimiError {
  reason: string
  status?: number
  detail?: string
}

export type KimiResponse =
  | { ok: true; result: KimiGridResult }
  | { ok: false; error: KimiError }

export async function analyzeGrid(
  imageBuffer: Buffer,
  mimeType: string
): Promise<KimiResponse> {
  const apiKey =
    process.env.MOONSHOT_API_KEY ||
    process.env.KIMI_API_KEY ||
    process.env.KIMI_CODE_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: { reason: "Kimi API key not set (MOONSHOT_API_KEY / KIMI_API_KEY / KIMI_CODE_API_KEY)" },
    }
  }

  // Get image dimensions to include in the prompt for better reasoning
  const meta = await sharp(imageBuffer).metadata()
  const imgWidth = meta.width ?? 0
  const imgHeight = meta.height ?? 0

  const base64 = imageBuffer.toString("base64")
  const dataUrl = `data:${mimeType};base64,${base64}`

  const prompt = `This image is a photo collage arranged as a rectangular grid. Image size: ${imgWidth}×${imgHeight} pixels.

Step 1 – count COLUMNS: look at the top edge of the image, count how many distinct photos sit side by side horizontally.
Step 2 – count ROWS: look at the left edge of the image, count how many distinct photos are stacked vertically from top to bottom.
Step 3 – verify: total photos = rows × cols. Make sure it matches what you see.

Return ONLY this JSON (no markdown, no explanation):
{"rows": <integer>, "cols": <integer>, "hasSeperator": <boolean>, "separatorColor": "<color or null>", "confidence": <0.0-1.0>}

Rules:
- rows: number from step 2 (photos stacked top-to-bottom)
- cols: number from step 1 (photos side-by-side left-to-right)
- hasSeperator: true only if uniform-color border lines are visible between cells; false if photos are edge-to-edge with no gap
- separatorColor: e.g. "white", "gray", or null
- confidence: 0.0–1.0 for your row/col count
- DO NOT confuse rows and cols; DO NOT undercount rows for a tall image`

  try {
    const response = await fetch(
      "https://api.moonshot.cn/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "kimi-k2.5",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUrl } },
                { type: "text", text: prompt },
              ],
            },
          ],
          max_tokens: 8192,
          temperature: 1,
        }),
        signal: AbortSignal.timeout(60000),
      }
    )

    if (!response.ok) {
      let detail = ""
      try {
        const body = await response.json()
        detail = body?.error?.message ?? JSON.stringify(body)
      } catch {
        detail = await response.text().catch(() => "")
      }
      console.error(`[Moonshot] HTTP ${response.status}:`, detail)
      return {
        ok: false,
        error: { reason: `API error ${response.status}`, status: response.status, detail },
      }
    }

    const data = await response.json()
    // kimi-k2.5 is a thinking model: answer may be in content or reasoning_content
    const msg = data.choices?.[0]?.message ?? {}
    const content: string =
      (typeof msg.content === "string" && msg.content.trim()
        ? msg.content
        : msg.reasoning_content ?? "") as string
    console.log("[Moonshot] finish_reason:", data.choices?.[0]?.finish_reason)
    console.log("[Moonshot] content:", content.slice(0, 300))

    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return {
        ok: false,
        error: { reason: "No JSON in response", detail: content.slice(0, 200) },
      }
    }

    let result: KimiGridResult
    try {
      result = JSON.parse(jsonMatch[0]) as KimiGridResult
    } catch {
      return {
        ok: false,
        error: { reason: "JSON parse failed", detail: jsonMatch[0] },
      }
    }

    if (
      typeof result.rows !== "number" ||
      result.rows < 1 ||
      typeof result.cols !== "number" ||
      result.cols < 1
    ) {
      return {
        ok: false,
        error: { reason: "Invalid grid values", detail: JSON.stringify(result) },
      }
    }

    const confidence =
      typeof result.confidence === "number" ? result.confidence : 0.8
    if (confidence < 0.6) {
      return {
        ok: false,
        error: {
          reason: `Low confidence (${confidence.toFixed(2)})`,
          detail: JSON.stringify(result),
        },
      }
    }

    return { ok: true, result: { ...result, confidence } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[Moonshot] fetch error:", msg)
    return { ok: false, error: { reason: msg } }
  }
}
