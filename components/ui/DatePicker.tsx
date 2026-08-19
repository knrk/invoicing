"use client"

import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

  function handleSelect(date: string) {
    onChange(date)
    setOpen(false)
  }

  // Popover renders its content in a portal to <body>, so the calendar is never
  // clipped by the form's overflow containers and always stacks above the preview.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 h-10",
            "text-sm text-left font-normal text-foreground",
            "hover:bg-nav-active transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
          <span className="flex-1">{value ? formatDate(value, language) : "Pick a date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-border p-0">
        <Calendar selected={value} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  )
}
