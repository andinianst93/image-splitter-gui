export interface SplitConfig {
  rows: number          // 0 = auto-detect
  cols: number          // 0 = auto-detect
  auto: boolean         // use seam detection for boundaries
  useAI?: boolean
  trim: boolean
  trimTolerance: number // default 60
  quality: number       // 0 = PNG, 1-100 = JPEG
  scale: number         // 0 = original, 1080/2048/4096 = target px on longest side
  extraSharp?: boolean  // add stronger sharpening when upscaling
}

export interface Cell {
  id: string
  index: number
  row: number
  col: number
  dataUrl: string       // base64 encoded output image
  width: number
  height: number
  format: "png" | "jpeg"
}

export interface GridLayout {
  rows: number
  cols: number
  order: number[]       // cell indices in new order
}

export interface SplitResult {
  cells: Cell[]
  grid: { rows: number; cols: number }
  method: "ai" | "algo"
  aiConfidence?: number
  aiError?: string
}
