"use client"

import { useState, useRef, useEffect } from "react"
import { Calendar } from "@/components/ui/calendar"
import { formatDate } from "@/lib/invoice"
import type { Language } from "@/types"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"

interface Props {
  value: string
  language: Language
  onChange: (value: string) => void
}

export default function DatePicker({ value, language, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function handleSelect(date: string) {
    onChange(date)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 h-10",
          "text-sm text-left font-normal text-foreground",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !value && "text-muted-foreground",
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
        <span className="flex-1">{value ? formatDate(value, language) : "Pick a date"}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <Calendar
            selected={value}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  )
}
