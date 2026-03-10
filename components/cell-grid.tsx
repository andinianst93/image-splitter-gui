"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import JSZip from "jszip"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Download,
  Package,
  Sparkles,
  Cpu,
  Loader2,
  LayoutGrid,
  Combine,
} from "lucide-react"
import { ReassembleBoard } from "@/components/reassemble-board"
import type { Cell, SplitResult } from "@/types"

interface CellGridProps {
  result: SplitResult
  quality: number
}

function downloadCell(cell: Cell) {
  const a = document.createElement("a")
  a.href = cell.dataUrl
  a.download = `cell_r${cell.row + 1}_c${cell.col + 1}.${cell.format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function downloadAllAsZip(
  cells: Cell[],
  onProgress: (n: number) => void
) {
  const zip = new JSZip()
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const base64 = cell.dataUrl.split(",")[1]
    zip.file(`cell_r${cell.row + 1}_c${cell.col + 1}.${cell.format}`, base64, {
      base64: true,
    })
    onProgress(Math.round(((i + 1) / cells.length) * 80))
  }
  onProgress(90)
  const blob = await zip.generateAsync({ type: "blob" })
  onProgress(100)

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "cells.zip"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function CellGrid({ result, quality }: CellGridProps) {
  const { cells, grid, method } = result
  const [zipping, setZipping] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)

  const handleDownloadAll = useCallback(async () => {
    setZipping(true)
    setZipProgress(0)
    try {
      await downloadAllAsZip(cells, setZipProgress)
      toast.success(`${cells.length} cells downloaded as ZIP`)
    } catch {
      toast.error("Failed to create ZIP")
    } finally {
      setZipping(false)
      setZipProgress(0)
    }
  }, [cells])

  return (
    <Tabs defaultValue="cells" className="space-y-4">
      {/* Tab bar + meta */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium text-foreground">
            {cells.length} cells
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-base text-muted-foreground">
            {grid.rows}×{grid.cols}
          </span>
          <Badge
            variant="secondary"
            className="gap-1 text-xs"
          >
            {method === "ai" ? (
              <>
                <Sparkles className="h-2.5 w-2.5" />
                Kimi AI
              </>
            ) : (
              <>
                <Cpu className="h-2.5 w-2.5" />
                Algorithm
              </>
            )}
          </Badge>
        </div>

        <TabsList className="p-0.5 h-8">
          <TabsTrigger
            value="cells"
            className="gap-1.5 text-sm h-6 px-2.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cells
          </TabsTrigger>
          <TabsTrigger
            value="reassemble"
            className="gap-1.5 text-sm h-6 px-2.5"
          >
            <Combine className="h-3.5 w-3.5" />
            Reassemble
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Cells tab */}
      <TabsContent value="cells" className="space-y-3 mt-0">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={zipping}
            className="gap-1.5 h-8 text-sm"
            onClick={handleDownloadAll}
          >
            {zipping ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {zipProgress}%
              </>
            ) : (
              <>
                <Package className="h-3.5 w-3.5" />
                Download all (ZIP)
              </>
            )}
          </Button>
        </div>

        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((cell) => (
            <Card
              key={cell.id}
              className="group relative overflow-hidden border-border bg-card p-0 rounded-md"
            >
              <div
                className="relative w-full"
                style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
              >
                <Image
                  src={cell.dataUrl}
                  alt={`Cell ${cell.row + 1}×${cell.col + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 20vw"
                  unoptimized
                />
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 pb-2.5">
                <Button
                  size="sm"
                  className="gap-1 h-7 text-xs font-medium shadow-lg"
                  onClick={() => downloadCell(cell)}
                >
                  <Download className="h-3 w-3" />
                  Save
                </Button>
              </div>

              {/* Dimensions badge */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Badge className="bg-black/60 text-white text-[9px] px-1 py-0 h-4 border-0">
                  {cell.width}×{cell.height}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </TabsContent>

      {/* Reassemble tab */}
      <TabsContent value="reassemble" className="mt-0">
        <ReassembleBoard result={result} quality={quality} />
      </TabsContent>
    </Tabs>
  )
}
