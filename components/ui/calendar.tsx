"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarProps {
  /** Selected date as YYYY-MM-DD string */
  selected?: string
  /** Called with YYYY-MM-DD when user picks a day */
  onSelect: (date: string) => void
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]
const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function toStr(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function todayStr(): string {
  const d = new Date()
  return toStr(d.getFullYear(), d.getMonth(), d.getDate())
}

// Returns 0-indexed weekday where Monday=0, Sunday=6
function weekday(year: number, month: number, day: number): number {
  return (new Date(year, month, day).getDay() + 6) % 7
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  const today = todayStr()

  // Initialise view to selected date or today
  const init = selected ?? today
  const [initY, initM] = init.split("-").map(Number)
  const [viewYear, setViewYear] = useState(initY)
  const [viewMonth, setViewMonth] = useState(initM - 1) // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const firstWeekday = weekday(viewYear, viewMonth, 1) // 0=Mon offset
  const totalDays = daysInMonth(viewYear, viewMonth)
  // Fill grid: leading empty cells + day cells, padded to complete weeks
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className={cn("p-3 select-none", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={prevMonth}
          className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0")}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0")}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-name headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-muted-foreground text-[0.8rem] font-normal text-center h-8 flex items-center justify-center">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />

          const dateStr = toStr(viewYear, viewMonth, day)
          const isSelected = dateStr === selected
          const isToday = dateStr === today

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              className={cn(
                "h-9 w-9 mx-auto rounded-md text-sm font-normal transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                !isSelected && isToday && "bg-accent text-accent-foreground font-semibold",
              )}
              aria-pressed={isSelected}
              aria-label={dateStr}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
