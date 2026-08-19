"use client"

import { YEAR_COOKIE } from "@/lib/year-filter"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

interface YearFilterValue {
  year: number
  setYear: (year: number) => void
  availableYears: number[]
}

const YearFilterContext = createContext<YearFilterValue | null>(null)

export function YearFilterProvider({
  availableYears,
  initialYear,
  children,
}: {
  availableYears: number[]
  initialYear: number
  children: React.ReactNode
}) {
  const [year, setYearState] = useState(initialYear)

  const setYear = useCallback((next: number) => {
    setYearState(next)
    // Persistence napříč reloady. Zápis cookie musí být na klientu —
    // Server Components cookie nastavovat nemohou (viz next/headers cookies docs).
    document.cookie = `${YEAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo(
    () => ({ year, setYear, availableYears }),
    [year, setYear, availableYears]
  )

  return <YearFilterContext.Provider value={value}>{children}</YearFilterContext.Provider>
}

export function useYearFilter(): YearFilterValue {
  const ctx = useContext(YearFilterContext)
  if (!ctx) throw new Error("useYearFilter must be used within a YearFilterProvider")
  return ctx
}
