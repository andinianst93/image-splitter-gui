interface PixelColor {
  r: number
  g: number
  b: number
}

const BORDER_EDGE_MATCH_REQUIRED = 0.9
const TRIM_WALK_MATCH_REQUIRED = 0.96

function getPixel(
  data: Buffer,
  width: number,
  x: number,
  y: number,
  channels: number
): PixelColor {
  const idx = (y * width + x) * channels
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] }
}

function colorDiff(a: PixelColor, b: PixelColor): number {
  return Math.max(
    Math.abs(a.r - b.r),
    Math.abs(a.g - b.g),
    Math.abs(a.b - b.b)
  )
}

function chromaSum(c: PixelColor): number {
  const avg = (c.r + c.g + c.b) / 3
  return (
    Math.abs(c.r - avg) + Math.abs(c.g - avg) + Math.abs(c.b - avg)
  )
}

function isLikelyLightSeparatorRow(
  data: Buffer,
  width: number,
  y: number,
  channels: number
): boolean {
  let matched = 0
  for (let x = 0; x < width; x++) {
    const p = getPixel(data, width, x, y, channels)
    const brightness = (p.r + p.g + p.b) / 3
    if (brightness >= 230 && chromaSum(p) <= 36) matched++
  }
  return matched / width >= 0.96
}

function isLikelyLightSeparatorCol(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  channels: number
): boolean {
  let matched = 0
  for (let y = 0; y < height; y++) {
    const p = getPixel(data, width, x, y, channels)
    const brightness = (p.r + p.g + p.b) / 3
    if (brightness >= 230 && chromaSum(p) <= 36) matched++
  }
  return matched / height >= 0.96
}

function rowMatchRatio(
  data: Buffer,
  width: number,
  y: number,
  channels: number,
  borderColor: PixelColor,
  tol: number
): number {
  let matched = 0
  for (let x = 0; x < width; x++) {
    if (colorDiff(getPixel(data, width, x, y, channels), borderColor) <= tol) {
      matched++
    }
  }
  return matched / width
}

function colMatchRatio(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  channels: number,
  borderColor: PixelColor,
  tol: number
): number {
  let matched = 0
  for (let y = 0; y < height; y++) {
    if (colorDiff(getPixel(data, width, x, y, channels), borderColor) <= tol) {
      matched++
    }
  }
  return matched / height
}

function isRowUniform(
  data: Buffer,
  width: number,
  y: number,
  channels: number,
  borderColor: PixelColor,
  tol: number
): boolean {
  return (
    rowMatchRatio(data, width, y, channels, borderColor, tol) >=
    BORDER_EDGE_MATCH_REQUIRED
  )
}

function isColUniform(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  channels: number,
  borderColor: PixelColor,
  tol: number
): boolean {
  return (
    colMatchRatio(data, width, height, x, channels, borderColor, tol) >=
    BORDER_EDGE_MATCH_REQUIRED
  )
}

function detectBorderColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  tol: number
): PixelColor | null {
  const edgeTol = Math.min(100, tol + 25)
  const candidates: PixelColor[] = [
    getPixel(data, width, 0, 0, channels),
    getPixel(data, width, width - 1, 0, channels),
    getPixel(data, width, 0, height - 1, channels),
    getPixel(data, width, width - 1, height - 1, channels),
    getPixel(data, width, Math.floor(width / 2), 0, channels),
    getPixel(data, width, Math.floor(width / 2), height - 1, channels),
    getPixel(data, width, 0, Math.floor(height / 2), channels),
    getPixel(data, width, width - 1, Math.floor(height / 2), channels),
  ]

  for (const c of candidates) {
    if (chromaSum(c) > 30) continue
    if (
      isRowUniform(data, width, 0, channels, c, edgeTol) ||
      isRowUniform(data, width, height - 1, channels, c, edgeTol) ||
      isColUniform(data, width, height, 0, channels, c, edgeTol) ||
      isColUniform(data, width, height, width - 1, channels, c, edgeTol)
    ) {
      return c
    }
  }
  return null
}

export interface TrimDepths {
  left: number
  right: number
  top: number
  bottom: number
}

export function calculateTrimDepths(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  tol: number = 60,
  maxDepthFraction: number = 0.15
): TrimDepths | null {
  const borderColor = detectBorderColor(data, width, height, channels, tol)
  if (!borderColor) return null

  let top = 0
  while (
    top < height &&
    rowMatchRatio(data, width, top, channels, borderColor, tol) >=
      TRIM_WALK_MATCH_REQUIRED
  )
    top++

  let bottom = 0
  while (
    bottom < height &&
    rowMatchRatio(
      data,
      width,
      height - 1 - bottom,
      channels,
      borderColor,
      tol
    ) >= TRIM_WALK_MATCH_REQUIRED
  )
    bottom++

  let left = 0
  while (
    left < width &&
    colMatchRatio(data, width, height, left, channels, borderColor, tol) >=
      TRIM_WALK_MATCH_REQUIRED
  )
    left++

  let right = 0
  while (
    right < width &&
    colMatchRatio(
      data,
      width,
      height,
      width - 1 - right,
      channels,
      borderColor,
      tol
    ) >= TRIM_WALK_MATCH_REQUIRED
  )
    right++

  // 15% depth cap
  const maxH = Math.floor(height * maxDepthFraction)
  const maxW = Math.floor(width * maxDepthFraction)
  let trimTop = top > maxH ? 0 : top
  let trimBottom = bottom > maxH ? 0 : bottom
  let trimLeft = left > maxW ? 0 : left
  let trimRight = right > maxW ? 0 : right

  // Final micro-shave for very light separator residue (common JPEG artifact).
  for (let i = 0; i < 3; i++) {
    const yTop = trimTop + i
    if (yTop < height && trimTop < maxH && isLikelyLightSeparatorRow(data, width, yTop, channels)) {
      trimTop++
    } else {
      break
    }
  }

  for (let i = 0; i < 3; i++) {
    const yBottom = height - 1 - (trimBottom + i)
    if (yBottom >= 0 && trimBottom < maxH && isLikelyLightSeparatorRow(data, width, yBottom, channels)) {
      trimBottom++
    } else {
      break
    }
  }

  for (let i = 0; i < 3; i++) {
    const xLeft = trimLeft + i
    if (xLeft < width && trimLeft < maxW && isLikelyLightSeparatorCol(data, width, height, xLeft, channels)) {
      trimLeft++
    } else {
      break
    }
  }

  for (let i = 0; i < 3; i++) {
    const xRight = width - 1 - (trimRight + i)
    if (xRight >= 0 && trimRight < maxW && isLikelyLightSeparatorCol(data, width, height, xRight, channels)) {
      trimRight++
    } else {
      break
    }
  }

  // Minimum result 10×10
  const newW = width - trimLeft - trimRight
  const newH = height - trimTop - trimBottom
  if (newW < 10 || newH < 10) return null

  return { top: trimTop, bottom: trimBottom, left: trimLeft, right: trimRight }
}
