"use client"

import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { cn } from "@/lib/utils"

export default function YearSelect({ className }: { className?: string }) {
  const { year, setYear, availableYears } = useYearFilter()
  return (
    <select
      aria-label="Filtr roku"
      value={year}
      onChange={(e) => setYear(Number(e.target.value))}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm font-semibold text-text-secondary tabular-nums outline-none transition-colors hover:bg-subtle hover:text-text focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {availableYears.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
