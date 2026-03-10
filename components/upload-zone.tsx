"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
  previewUrl: string | null
  onClear: () => void
}

export function UploadZone({
  onFileSelect,
  selectedFile,
  previewUrl,
  onClear,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith("image/")) {
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect]
  )

  if (previewUrl && selectedFile) {
    return (
      <Card className="relative overflow-hidden border-border bg-card">
        <div className="relative w-full" style={{ minHeight: "300px" }}>
          <Image
            src={previewUrl}
            alt="Uploaded collage"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 60vw"
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClear}
          className="absolute right-2 top-2 h-7 w-7 bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground backdrop-blur-sm"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <div className="border-t border-border px-4 py-2.5">
          <p className="text-sm text-muted-foreground">
            {selectedFile.name}
            <span className="mx-2 opacity-40">·</span>
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        className={`flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-5 border-2 border-dashed transition-colors ${
          isDragging
            ? "border-foreground/40 bg-muted/60"
            : "border-border hover:border-foreground/30 hover:bg-muted/40"
        } bg-card`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-foreground">
            Drop collage image here
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            or click to browse
          </p>
          <p className="mt-3 text-xs text-muted-foreground/50">
            PNG · JPEG · WebP · AVIF · TIFF · GIF
          </p>
        </div>
      </Card>
      <input
        id="file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </>
  )
}
