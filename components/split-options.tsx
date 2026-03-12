"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Zap, Grid2x2, Loader2, Info } from "lucide-react"
import type { SplitConfig } from "@/types"

interface SplitOptionsProps {
  config: SplitConfig
  onChange: (config: SplitConfig) => void
  onSplit: () => void
  isProcessing: boolean
  hasFile: boolean
}

export function SplitOptions({
  config,
  onChange,
  onSplit,
  isProcessing,
  hasFile,
}: SplitOptionsProps) {
  const mode = config.rows === 0 && config.cols === 0 ? "auto" : "manual"
  const gridOptions = Array.from({ length: 10 }, (_, i) => i + 1)

  function setMode(value: string) {
    if (value === "auto") {
      onChange({ ...config, rows: 0, cols: 0, auto: true })
    } else {
      onChange({
        ...config,
        rows: config.rows || 2,
        cols: config.cols || 2,
        auto: false,
      })
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">
          Options
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Mode */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            Grid detection
          </Label>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full p-0.5">
              <TabsTrigger
                value="auto"
                className="flex-1 gap-1.5 text-sm h-8"
              >
                <Zap className="h-3.5 w-3.5" />
                Auto
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="flex-1 gap-1.5 text-sm h-8"
              >
                <Grid2x2 className="h-3.5 w-3.5" />
                Manual
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Auto mode hint */}
        {mode === "auto" && (
          <p className="text-xs text-muted-foreground/70 bg-muted rounded-md px-3 py-2 leading-relaxed">
            Kimi AI detects the grid automatically. For edge-to-edge collages (no borders), use{" "}
            <button
              className="underline underline-offset-2 cursor-pointer"
              onClick={() => setMode("manual")}
            >
              Manual mode
            </button>.
          </p>
        )}

        {/* Rows / Cols — manual only */}
        {mode === "manual" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Rows</Label>
              <select
                value={String(config.rows || 2)}
                onChange={(e) =>
                  onChange({
                    ...config,
                    rows: Number(e.target.value),
                    auto: false,
                  })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {gridOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Cols</Label>
              <select
                value={String(config.cols || 2)}
                onChange={(e) =>
                  onChange({
                    ...config,
                    cols: Number(e.target.value),
                    auto: false,
                  })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {gridOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Seam detection — auto mode only */}
        {mode === "auto" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-foreground cursor-pointer">
                Seam detection
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-44 text-xs">
                  Snaps split boundaries to separator gaps using energy-based
                  detection.
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              checked={config.auto}
              onCheckedChange={(v) => onChange({ ...config, auto: v })}
            />
          </div>
        )}

        {/* Trim */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-foreground cursor-pointer">
              Trim borders
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-44 text-xs">
                Removes uniform-color separator residue from each cell edge.
                Max 15% depth per side.
              </TooltipContent>
            </Tooltip>
          </div>
          <Switch
            checked={config.trim}
            onCheckedChange={(v) => onChange({ ...config, trim: v })}
          />
        </div>

        <Separator />

        {/* Quality */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">
              Output quality
            </Label>
            <span className="text-sm text-muted-foreground">
              {config.quality === 0 ? "PNG" : `JPEG ${config.quality}%`}
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[config.quality]}
            onValueChange={([v]) => onChange({ ...config, quality: v })}
          />
          <div className="flex justify-between text-xs text-muted-foreground/50">
            <span>PNG</span>
            <span>JPEG</span>
          </div>
        </div>

        {/* Split button */}
        <Button
          className="w-full font-medium"
          disabled={!hasFile || isProcessing}
          onClick={onSplit}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Splitting…
            </>
          ) : (
            "Split Image"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
