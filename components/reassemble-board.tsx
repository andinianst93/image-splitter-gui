"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Download, RotateCcw, Combine } from "lucide-react"
import type { Cell, SplitResult } from "@/types"

interface SortableCellProps {
  cell: Cell
  size: number
}

function SortableCell({ cell, size }: SortableCellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cell.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    width: size,
    height: size,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative cursor-grab rounded overflow-hidden border border-border bg-card active:cursor-grabbing select-none"
    >
      <Image
        src={cell.dataUrl}
        alt={`cell ${cell.row + 1}×${cell.col + 1}`}
        fill
        className="object-contain"
        sizes="120px"
        unoptimized
        draggable={false}
      />
      <div className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0 text-[9px] text-zinc-500 leading-4">
        {cell.row + 1},{cell.col + 1}
      </div>
    </div>
  )
}

interface ReassembleBoardProps {
  result: SplitResult
  quality: number
}

export function ReassembleBoard({ result, quality }: ReassembleBoardProps) {
  const [cells, setCells] = useState<Cell[]>(result.cells)
  const [outRows, setOutRows] = useState(result.grid.rows)
  const [outCols, setOutCols] = useState(result.grid.cols)
  const [gap, setGap] = useState(0)
  const [outQuality, setOutQuality] = useState(quality)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const [assembled, setAssembled] = useState<{
    dataUrl: string
    width: number
    height: number
    format: string
  } | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (over && active.id !== over.id) {
      setCells((prev) => {
        const oldIdx = prev.findIndex((c) => c.id === active.id)
        const newIdx = prev.findIndex((c) => c.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }, [])

  const handleReset = useCallback(() => {
    setCells(result.cells)
    setOutRows(result.grid.rows)
    setOutCols(result.grid.cols)
  }, [result])

  const handleBuild = useCallback(async () => {
    setIsBuilding(true)
    setAssembled(null)
    try {
      const res = await fetch("/api/reassemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cells: cells.slice(0, outRows * outCols),
          rows: outRows,
          cols: outCols,
          quality: outQuality,
          gap,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Reassemble failed")
      }
      const data = await res.json()
      setAssembled(data)
      setShowPreview(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsBuilding(false)
    }
  }, [cells, outRows, outCols, outQuality, gap])

  function downloadAssembled() {
    if (!assembled) return
    const a = document.createElement("a")
    a.href = assembled.dataUrl
    a.download = `collage.${assembled.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const activeCell = activeId ? cells.find((c) => c.id === activeId) : null
  const cellSize = Math.max(72, Math.min(120, Math.floor(520 / Math.max(outCols, result.grid.cols))))

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Output grid */}
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">Rows</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={outRows}
              onChange={(e) => setOutRows(parseInt(e.target.value) || 1)}
              className="h-8 w-16 bg-zinc-900 border-zinc-800 text-white text-sm focus-visible:ring-zinc-700"
            />
          </div>
          <span className="text-zinc-600 pb-1.5">×</span>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">Cols</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={outCols}
              onChange={(e) => setOutCols(parseInt(e.target.value) || 1)}
              className="h-8 w-16 bg-zinc-900 border-zinc-800 text-white text-sm focus-visible:ring-zinc-700"
            />
          </div>
        </div>

        <Separator orientation="vertical" className="h-8 bg-zinc-800" />

        {/* Gap */}
        <div className="space-y-1.5 min-w-32">
          <div className="flex justify-between">
            <Label className="text-xs text-zinc-500">Gap</Label>
            <span className="text-xs text-zinc-600">{gap}px</span>
          </div>
          <Slider
            min={0}
            max={40}
            step={2}
            value={[gap]}
            onValueChange={([v]) => setGap(v)}
            className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-zinc-700 [&_[role=slider]]:shadow-none"
          />
        </div>

        <Separator orientation="vertical" className="h-8 bg-zinc-800" />

        {/* Quality */}
        <div className="space-y-1.5 min-w-32">
          <div className="flex justify-between">
            <Label className="text-xs text-zinc-500">Quality</Label>
            <span className="text-xs text-zinc-600">
              {outQuality === 0 ? "PNG" : `JPEG ${outQuality}%`}
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[outQuality]}
            onValueChange={([v]) => setOutQuality(v)}
            className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-zinc-700 [&_[role=slider]]:shadow-none"
          />
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            className="h-8 gap-1.5 border-zinc-800 bg-transparent text-zinc-500 hover:bg-zinc-900 hover:text-white text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleBuild}
            disabled={isBuilding}
            className="h-8 gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-medium"
          >
            {isBuilding ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <Combine className="h-3 w-3" />
                Build Collage
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-zinc-700">
        Drag cells to reorder · Using {Math.min(cells.length, outRows * outCols)} of {cells.length} cells
      </p>

      {/* Sortable grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={cells.map((c) => c.id)}
          strategy={rectSortingStrategy}
        >
          <div
            className="flex flex-wrap gap-1.5"
            style={{ maxWidth: outCols * (cellSize + 6) }}
          >
            {cells.map((cell, idx) => {
              const isInGrid = idx < outRows * outCols
              return (
                <div
                  key={cell.id}
                  className={!isInGrid ? "opacity-30" : ""}
                  title={
                    !isInGrid ? "Outside output grid — will be excluded" : undefined
                  }
                >
                  <SortableCell cell={cell} size={cellSize} />
                </div>
              )
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCell && (
            <div
              className="rounded overflow-hidden border border-white/30 opacity-90 shadow-2xl"
              style={{ width: cellSize, height: cellSize }}
            >
              <Image
                src={activeCell.dataUrl}
                alt="dragging"
                width={cellSize}
                height={cellSize}
                className="object-contain"
                unoptimized
                draggable={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-white">
              Assembled Collage
              {assembled && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {assembled.width}×{assembled.height}px
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {assembled && (
            <div className="space-y-4">
              <div className="relative w-full overflow-hidden rounded border border-zinc-800 bg-black">
                <Image
                  src={assembled.dataUrl}
                  alt="Assembled collage"
                  width={assembled.width}
                  height={assembled.height}
                  className="w-full h-auto object-contain"
                  unoptimized
                />
              </div>
              <Button
                className="w-full gap-2 bg-white text-black hover:bg-zinc-200 font-medium"
                onClick={downloadAssembled}
              >
                <Download className="h-4 w-4" />
                Download ({assembled.format.toUpperCase()})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
