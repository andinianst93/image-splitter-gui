function rowAverageBrightness(
  data: Buffer,
  width: number,
  y: number,
  channels: number
): number {
  let sum = 0
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * channels
    sum += (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000
  }
  return sum / width
}

function colAverageBrightness(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  channels: number
): number {
  let sum = 0
  for (let y = 0; y < height; y++) {
    const idx = (y * width + x) * channels
    sum += (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000
  }
  return sum / height
}

function boxFilter(arr: number[], radius: number): number[] {
  const result = new Array(arr.length).fill(0)
  for (let i = 0; i < arr.length; i++) {
    let sum = 0
    let count = 0
    const start = Math.max(0, i - radius)
    const end = Math.min(arr.length - 1, i + radius)
    for (let j = start; j <= end; j++) {
      sum += arr[j]
      count++
    }
    result[i] = sum / count
  }
  return result
}

function snapToGapCenter(
  pos: number,
  brightness: number[],
  variance: number[],
  tol: number = 8
): number {
  // Only snap if this row is a uniform separator band (low variance).
  // For photo-content rows (high variance), snapping causes wrong results.
  const varThreshold = 50
  if (variance[pos] > varThreshold) return pos

  const ref = brightness[pos]
  let left = pos
  let right = pos
  // Limit snap radius to avoid drifting far on large uniform areas
  const maxRadius = Math.max(5, Math.round(brightness.length * 0.015))
  while (
    left > 0 &&
    pos - left < maxRadius &&
    Math.abs(brightness[left - 1] - ref) < tol
  )
    left--
  while (
    right < brightness.length - 1 &&
    right - pos < maxRadius &&
    Math.abs(brightness[right + 1] - ref) < tol
  )
    right++
  return Math.round((left + right) / 2)
}

export function detectHorizSeams(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  rows: number
): number[] {
  const brightness: number[] = []
  const variance: number[] = []
  for (let y = 0; y < height; y++) {
    brightness.push(rowAverageBrightness(data, width, y, channels))
    variance.push(rowVariance(data, width, y, channels))
  }

  const energy = new Array(height).fill(0)
  for (let y = 0; y < height - 1; y++) {
    energy[y] = Math.abs(brightness[y] - brightness[y + 1])
  }
  const smoothed = boxFilter(energy, 5)

  const seams: number[] = []
  for (let i = 1; i < rows; i++) {
    const expected = Math.round((height * i) / rows)
    const window = Math.round(height * 0.25)
    const start = Math.max(1, expected - window)
    const end = Math.min(height - 2, expected + window)

    let maxE = -1
    let seamPos = expected
    for (let y = start; y <= end; y++) {
      if (smoothed[y] > maxE) {
        maxE = smoothed[y]
        seamPos = y
      }
    }
    seams.push(snapToGapCenter(seamPos, brightness, variance))
  }
  return seams
}

export function detectVertSeams(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  cols: number
): number[] {
  const brightness: number[] = []
  const variance: number[] = []
  for (let x = 0; x < width; x++) {
    brightness.push(colAverageBrightness(data, width, height, x, channels))
    variance.push(colVariance(data, width, height, x, channels))
  }

  const energy = new Array(width).fill(0)
  for (let x = 0; x < width - 1; x++) {
    energy[x] = Math.abs(brightness[x] - brightness[x + 1])
  }
  const smoothed = boxFilter(energy, 5)

  const seams: number[] = []
  for (let i = 1; i < cols; i++) {
    const expected = Math.round((width * i) / cols)
    const window = Math.round(width * 0.25)
    const start = Math.max(1, expected - window)
    const end = Math.min(width - 2, expected + window)

    let maxE = -1
    let seamPos = expected
    for (let x = start; x <= end; x++) {
      if (smoothed[x] > maxE) {
        maxE = smoothed[x]
        seamPos = x
      }
    }
    seams.push(snapToGapCenter(seamPos, brightness, variance))
  }
  return seams
}

/**
 * Per-row pixel variance: measures how UNIFORM a row is.
 * Near-zero  → uniform separator (grey/white band).
 * High       → varied photo content.
 */
function rowVariance(
  data: Buffer,
  width: number,
  y: number,
  channels: number
): number {
  let sum = 0
  let sumSq = 0
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * channels
    const b = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000
    sum += b
    sumSq += b * b
  }
  const mean = sum / width
  return sumSq / width - mean * mean
}

function colVariance(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  channels: number
): number {
  let sum = 0
  let sumSq = 0
  for (let y = 0; y < height; y++) {
    const idx = (y * width + x) * channels
    const b = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000
    sum += b
    sumSq += b * b
  }
  const mean = sum / height
  return sumSq / height - mean * mean
}

export function autoDetectGridSize(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { rows: number; cols: number; reliable: boolean } {
  /**
   * Separator-band detection using per-row/col variance.
   *
   * Separator rows are UNIFORM (variance ≈ 0).
   * Photo rows have high variance (lots of visual content).
   *
   * Works well for collages with any uniform-color separator.
   * Returns reliable=false for edge-to-edge collages (no separators).
   */
  function countFromVariance(variances: number[], dimension: number): number {
    const minCell = Math.max(20, Math.floor(dimension * 0.05))

    // Find the "floor" variance: bottom 5th percentile (most uniform rows)
    const sorted = [...variances].sort((a, b) => a - b)
    const p5 = sorted[Math.floor(sorted.length * 0.05)]

    // A row is a separator candidate if its variance is ≤ 4× the floor
    // This catches grey (var≈0), white (var≈0), and near-uniform rows (JPEG noise)
    const threshold = Math.max(p5 * 4, 8)

    // A separator band must also be "much more uniform" than the median row
    const p50 = sorted[Math.floor(sorted.length * 0.50)]
    // If the most-uniform rows are similar to the median, there are no real separators
    if (p5 * 6 >= p50) return 0 // no clear separators

    let bands = 0
    let inBand = false
    for (let i = minCell; i < dimension - minCell; i++) {
      if (variances[i] <= threshold && !inBand) {
        bands++
        inBand = true
      } else if (variances[i] > threshold) {
        inBand = false
      }
    }

    return bands
  }

  const rowVar: number[] = []
  for (let y = 0; y < height; y++) {
    rowVar.push(rowVariance(data, width, y, channels))
  }

  const colVar: number[] = []
  for (let x = 0; x < width; x++) {
    colVar.push(colVariance(data, width, height, x, channels))
  }

  const rowBands = countFromVariance(rowVar, height)
  const colBands = countFromVariance(colVar, width)

  const detectedRows = rowBands > 0 ? rowBands + 1 : 0
  const detectedCols = colBands > 0 ? colBands + 1 : 0
  const reliable = detectedRows > 0 && detectedCols > 0

  return {
    rows: Math.max(1, detectedRows),
    cols: Math.max(1, detectedCols),
    reliable,
  }
}
