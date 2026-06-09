"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function Nav() {
  const path = usePathname()

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-10 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.12em] text-text"
        >
          Fakturace
        </Link>
        <nav className="flex items-center gap-1">
          {[
            { href: "/", label: "Faktury" },
            { href: "/settings", label: "Nastavení" },
          ].map(({ href, label }) => (
            <Button
              key={href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(
                path === href && "bg-subtle text-text font-medium"
              )}
            >
              <Link href={href}>{label}</Link>
            </Button>
          ))}
          <Button size="sm" asChild className="ml-3">
            <Link href="/invoice/new">+ Nová faktura</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
