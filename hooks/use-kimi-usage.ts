"use client"

import { useState, useCallback } from "react"

const UNLIMITED = Number.MAX_SAFE_INTEGER

export function useKimiUsage() {
  const [count, setCount] = useState(0)

  const increment = useCallback(() => {
    setCount((prev) => prev + 1)
  }, [])

  return {
    count,
    remaining: UNLIMITED,
    limit: UNLIMITED,
    isLimitReached: false,
    increment,
  }
}
