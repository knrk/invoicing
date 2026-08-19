"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { cn } from "@/lib/utils"

export default function YearSelect({ className }: { className?: string }) {
  const { year, setYear, availableYears } = useYearFilter()
  return (
    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
      <SelectTrigger
        aria-label="Filtr roku"
        className={cn(
          "h-auto w-auto gap-1 border-0 bg-transparent px-1 py-0.5 text-[22px] leading-none font-bold text-text tabular-nums transition-colors hover:text-text/70 focus:ring-0 focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-ring",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableYears.map((y) => (
          <SelectItem key={y} value={String(y)} className="font-bold tabular-nums">
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
