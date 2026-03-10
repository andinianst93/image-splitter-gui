"use client"

import { useState, useEffect, useCallback } from "react"

const LIMIT = 3
const IS_DEV = process.env.NODE_ENV === "development"
const STORAGE_KEY = "kimi_daily_usage"

interface KimiUsage {
  count: number
  date: string // YYYY-MM-DD
}

function today(): string {
  return new Date().toISOString().split("T")[0]
}

function loadUsage(): KimiUsage {
  if (typeof window === "undefined") return { count: 0, date: today() }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { count: 0, date: today() }
    const parsed = JSON.parse(raw) as KimiUsage
    // Reset if it's a new day
    if (parsed.date !== today()) return { count: 0, date: today() }
    return parsed
  } catch {
    return { count: 0, date: today() }
  }
}

export function useKimiUsage() {
  const [usage, setUsage] = useState<KimiUsage>({ count: 0, date: today() })

  useEffect(() => {
    const u = loadUsage()
    setUsage(u)
    // Persist reset if day changed
    if (u.count === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    }
  }, [])

  const increment = useCallback(() => {
    setUsage((prev) => {
      const next: KimiUsage = {
        count: Math.min(prev.count + 1, LIMIT),
        date: today(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return {
    count: usage.count,
    remaining: IS_DEV ? LIMIT : Math.max(0, LIMIT - usage.count),
    limit: LIMIT,
    isLimitReached: IS_DEV ? false : usage.count >= LIMIT,
    increment,
  }
}
