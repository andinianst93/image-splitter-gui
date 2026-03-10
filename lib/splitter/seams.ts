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
  smoothedEnergy: number[]
): number {
  // Find the widest band of near-zero energy (= uniform separator) within reach.
  // Uses raw energy profile so JPEG-noisy separators (energy ≈ 0) are detected correctly.
  const sorted = [...smoothedEnergy].sort((a, b) => a - b)
  const p10 = sorted[Math.floor(sorted.length * 0.10)]
  const threshold = Math.max(p10 * 4, 0.5)

  const maxRadius = Math.max(15, Math.round(smoothedEnergy.length * 0.05))
  const lo = Math.max(0, pos - maxRadius)
  const hi = Math.min(smoothedEnergy.length - 1, pos + maxRadius)

  let bestStart = -1
  let bestWidth = 0
  let i = lo
  while (i <= hi) {
    if (smoothedEnergy[i] <= threshold) {
      let j = i
      while (j <= hi && smoothedEnergy[j] <= threshold) j++
      const w = j - i
      if (w > bestWidth) {
        bestWidth = w
        bestStart = i
      }
      i = j
    } else {
      i++
    }
  }

  if (bestWidth === 0) return pos
  return Math.round(bestStart + (bestWidth - 1) / 2)
}

export function detectHorizSeams(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  rows: number
): number[] {
  const brightness: number[] = []
  for (let y = 0; y < height; y++) {
    brightness.push(rowAverageBrightness(data, width, y, channels))
  }

  const rawEnergy = new Array(height).fill(0)
  for (let y = 0; y < height - 1; y++) {
    rawEnergy[y] = Math.abs(brightness[y] - brightness[y + 1])
  }
  const smoothed = boxFilter(rawEnergy, 5)

  const seams: number[] = []
  for (let i = 1; i < rows; i++) {
    const expected = Math.round((height * i) / rows)
    const window = Math.round(height * 0.2)
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
    seams.push(snapToGapCenter(seamPos, rawEnergy))
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
  for (let x = 0; x < width; x++) {
    brightness.push(colAverageBrightness(data, width, height, x, channels))
  }

  const rawEnergy = new Array(width).fill(0)
  for (let x = 0; x < width - 1; x++) {
    rawEnergy[x] = Math.abs(brightness[x] - brightness[x + 1])
  }
  const smoothed = boxFilter(rawEnergy, 5)

  const seams: number[] = []
  for (let i = 1; i < cols; i++) {
    const expected = Math.round((width * i) / cols)
    const window = Math.round(width * 0.2)
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
    seams.push(snapToGapCenter(seamPos, rawEnergy))
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
    const p50 = sorted[Math.floor(sorted.length * 0.5)]

    // Require a meaningful contrast between separator rows and content rows.
    // If p5 ≈ p50 the image is edge-to-edge with no uniform separator bands.
    if (p5 * 6 >= p50) return 0

    // Threshold: 6× the floor variance, min 25 to tolerate JPEG noise on
    // beige/grey separators (JPEG quantisation can push variance to ~10–20).
    const threshold = Math.max(p5 * 6, 25)

    let bands = 0
    let runStart = -1

    for (let i = minCell; i <= dimension - minCell; i++) {
      const inside = i < dimension - minCell
      const isCandidate = inside && variances[i] <= threshold

      if (isCandidate && runStart < 0) {
        runStart = i
      }

      if ((!isCandidate || !inside) && runStart >= 0) {
        bands++
        runStart = -1
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

function estimateAxisCountFromEnergy(energy: number[], dimension: number): number {
  const smoothed = boxFilter(energy, 5)
  const mean = smoothed.reduce((a, b) => a + b, 0) / Math.max(1, smoothed.length)
  const maxCount = Math.max(2, Math.min(6, Math.floor(dimension / 140)))

  let bestCount = 2
  let bestScore = -Infinity

  for (let count = 2; count <= maxCount; count++) {
    const window = Math.max(3, Math.floor(dimension * 0.08))
    let peakSum = 0

    for (let i = 1; i < count; i++) {
      const expected = Math.round((dimension * i) / count)
      const start = Math.max(1, expected - window)
      const end = Math.min(dimension - 2, expected + window)
      let localMax = 0
      for (let p = start; p <= end; p++) {
        if (smoothed[p] > localMax) localMax = smoothed[p]
      }
      peakSum += localMax
    }

    const avgPeak = peakSum / Math.max(1, count - 1)
    const normalized = avgPeak / Math.max(0.001, mean)
    const score = normalized - count * 0.04

    if (score > bestScore) {
      bestScore = score
      bestCount = count
    }
  }

  return bestCount
}

export function estimateGridFromEnergy(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { rows: number; cols: number } {
  const rowBrightness: number[] = []
  for (let y = 0; y < height; y++) {
    rowBrightness.push(rowAverageBrightness(data, width, y, channels))
  }
  const rowEnergy = new Array(height).fill(0)
  for (let y = 0; y < height - 1; y++) {
    rowEnergy[y] = Math.abs(rowBrightness[y] - rowBrightness[y + 1])
  }

  const colBrightness: number[] = []
  for (let x = 0; x < width; x++) {
    colBrightness.push(colAverageBrightness(data, width, height, x, channels))
  }
  const colEnergy = new Array(width).fill(0)
  for (let x = 0; x < width - 1; x++) {
    colEnergy[x] = Math.abs(colBrightness[x] - colBrightness[x + 1])
  }

  return {
    rows: estimateAxisCountFromEnergy(rowEnergy, height),
    cols: estimateAxisCountFromEnergy(colEnergy, width),
  }
}
