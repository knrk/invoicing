"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MetalFx } from "metal-fx"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface MetalLinkButtonProps {
  href: string
  label: string
  collapsed: boolean
}

// The button fill is dark in both app themes, so MetalFx always uses its dark
// tuning (the light tuning blends with `multiply` and vanishes on a dark fill).
// MetalFx owns the surface and forces the child's background transparent, so
// the fill and icon color are set on the wrapper.
export default function MetalLinkButton({ href, label, collapsed }: MetalLinkButtonProps) {
  // MetalFx renders a different tree on the server (no WebGL), so mount it client-side only.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const link = (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center justify-center w-full text-sm font-semibold",
        collapsed ? "aspect-square rounded-full" : "h-9 rounded-lg gap-2"
      )}
    >
      <Plus className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  )

  const surface = {
    background: "var(--color-primary)",
    color: "var(--color-primary-foreground)",
  }

  if (!mounted) {
    return (
      <div className={cn("w-full", collapsed ? "rounded-full" : "rounded-lg")} style={surface}>
        {link}
      </div>
    )
  }

  return (
    <MetalFx
      preset="silver"
      variant={collapsed ? "circle" : "button"}
      theme="dark"
      className="w-full"
      style={surface}
    >
      {link}
    </MetalFx>
  )
}
