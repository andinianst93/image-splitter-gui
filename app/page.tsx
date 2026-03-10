"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { Scissors } from "lucide-react"
import { UploadZone } from "@/components/upload-zone"
import { SplitOptions } from "@/components/split-options"
import { CellGrid } from "@/components/cell-grid"
import { ThemeToggle } from "@/components/theme-toggle"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useKimiUsage } from "@/hooks/use-kimi-usage"
import type { SplitConfig, SplitResult } from "@/types"

const DEFAULT_CONFIG: SplitConfig = {
  rows: 0,
  cols: 0,
  auto: true,
  useAI: true,
  trim: true,
  trimTolerance: 60,
  quality: 0,
  scale: 1,
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [config, setConfig] = useState<SplitConfig>(DEFAULT_CONFIG)
  const [result, setResult] = useState<SplitResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState("")
  const { remaining, isLimitReached, increment: incrementAI } = useKimiUsage()

  // Auto-disable AI when daily limit is reached
  useEffect(() => {
    if (isLimitReached && config.useAI) {
      setConfig((c) => ({ ...c, useAI: false }))
      toast.warning("Kimi AI daily limit reached (3/3). Switched to algorithm.", {
        duration: 5000,
      })
    }
  }, [isLimitReached]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }, [])

  const handleClear = useCallback(() => {
    setFile(null)
    setResult(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const handleSplit = useCallback(async () => {
    if (!file) return
    setIsProcessing(true)
    setResult(null)
    setProgress(15)
    setStage("Uploading…")

    try {
      // Increment AI usage counter before the request
      const willUseAI = config.useAI && !isLimitReached
      if (willUseAI) incrementAI()

      const formData = new FormData()
      formData.append("file", file)
      formData.append("config", JSON.stringify({ ...config, useAI: willUseAI }))

      setProgress(35)
      setStage(willUseAI ? "Analyzing with Kimi AI…" : "Detecting grid…")

      const res = await fetch("/api/split", {
        method: "POST",
        body: formData,
      })

      setProgress(75)
      setStage("Processing cells…")

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Split failed")
      }

      const data: SplitResult = await res.json()
      setProgress(100)
      setStage("Done")
      setResult(data)

      if (data.aiError) {
        toast.warning("Kimi AI failed — check server logs", {
          description: data.aiError,
          duration: 8000,
        })
      }
      toast.success(
        `Split into ${data.cells.length} cells · ${data.grid.rows}×${data.grid.cols} · ${data.method === "ai" ? "Kimi AI" : "algorithm"}`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsProcessing(false)
      setTimeout(() => {
        setProgress(0)
        setStage("")
      }, 600)
    }
  }, [file, config])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card">
                <Scissors className="h-4 w-4 text-foreground" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Image Splitter
              </h1>
              <Badge
                variant="secondary"
                className="text-xs"
              >
                Beta
              </Badge>
            </div>
            <p className="mt-2 pl-12 text-sm text-muted-foreground">
              Split collage images into individual cells — AI-powered or
              algorithmic
            </p>
          </div>
          <ThemeToggle />
        </header>

        {/* Layout */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_272px]">
          {/* Left */}
          <div className="space-y-5">
            <UploadZone
              onFileSelect={handleFileSelect}
              selectedFile={file}
              previewUrl={previewUrl}
              onClear={handleClear}
            />

            {/* Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{stage}</span>
                  <span className="text-sm text-muted-foreground/60">{progress}%</span>
                </div>
                <Progress
                  value={progress}
                  className="h-0.5 bg-muted [&>div]:bg-foreground [&>div]:transition-all"
                />
              </div>
            )}

            {/* Results */}
            {result && <CellGrid result={result} quality={config.quality} />}
          </div>

          {/* Right: options */}
          <aside>
            <SplitOptions
              config={config}
              onChange={setConfig}
              onSplit={handleSplit}
              isProcessing={isProcessing}
              hasFile={!!file}
              aiRemaining={remaining}
              aiLimitReached={isLimitReached}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
