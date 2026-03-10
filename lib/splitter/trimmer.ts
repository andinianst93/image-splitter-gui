interface PixelColor {
  r: number
  g: number
  b: number
}

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
  return rowMatchRatio(data, width, y, channels, borderColor, tol) >= 1
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
  return colMatchRatio(data, width, height, x, channels, borderColor, tol) >= 1
}

function detectBorderColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  tol: number
): PixelColor | null {
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
      isRowUniform(data, width, 0, channels, c, tol) ||
      isRowUniform(data, width, height - 1, channels, c, tol) ||
      isColUniform(data, width, height, 0, channels, c, tol) ||
      isColUniform(data, width, height, width - 1, channels, c, tol)
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

  const edgeMatchThreshold = 0.985

  let top = 0
  while (
    top < height &&
    rowMatchRatio(data, width, top, channels, borderColor, tol) >= edgeMatchThreshold
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
    ) >= edgeMatchThreshold
  )
    bottom++

  let left = 0
  while (
    left < width &&
    colMatchRatio(data, width, height, left, channels, borderColor, tol) >=
      edgeMatchThreshold
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
    ) >= edgeMatchThreshold
  )
    right++

  // 15% depth cap
  const maxH = Math.floor(height * maxDepthFraction)
  const maxW = Math.floor(width * maxDepthFraction)
  const trimTop = top > maxH ? 0 : top
  const trimBottom = bottom > maxH ? 0 : bottom
  const trimLeft = left > maxW ? 0 : left
  const trimRight = right > maxW ? 0 : right

  // Minimum result 10×10
  const newW = width - trimLeft - trimRight
  const newH = height - trimTop - trimBottom
  if (newW < 10 || newH < 10) return null

  return { top: trimTop, bottom: trimBottom, left: trimLeft, right: trimRight }
}
