"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FileText, Settings, Plus, Users } from "lucide-react"

export default function Nav() {
  const path = usePathname()

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-10 h-14 flex items-center justify-between">
        <Button size="sm" variant="dark" asChild>
          <Link href="/invoice/new">
            <Plus className="h-4 w-4" />
            Nová faktura
          </Link>
        </Button>
        <nav className="flex items-center gap-1">
          {[
            { href: "/",           label: "Faktury",      icon: FileText },
            { href: "/customers",  label: "Odběratelé",   icon: Users    },
            { href: "/settings",   label: "Nastavení",    icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(
                "gap-1.5",
                path === href && "bg-subtle text-text font-medium"
              )}
            >
              <Link href={href}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  )
}
