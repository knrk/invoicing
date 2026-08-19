"use client"

import { cn } from "@/lib/utils"

export interface TabItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-subtle p-1",
        className
      )}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium cursor-pointer transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-text-secondary hover:text-text"
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}
