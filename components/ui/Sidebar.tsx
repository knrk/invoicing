"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileText, Settings, Contact, Plus, ReceiptText,
  Moon, Sun, ChevronLeft, BadgeEuro,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

const NAV_ITEMS = [
  { href: "/",                    label: "Faktury",           icon: FileText  },
  { href: "/vat-recapitulative-statement", label: "Souhrnné hlášení", icon: BadgeEuro },
  { href: "/customers",           label: "Odběratelé",        icon: Contact   },
]

const BOTTOM_ITEMS = [
  { href: "/settings",  label: "Nastavení",  icon: Settings },
]

type Theme = "light" | "dark"

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function DarkModeToggle({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null
    const resolved = saved ?? getSystemTheme()
    setTheme(resolved)
    document.documentElement.dataset.theme = resolved
  }, [])

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem("theme", next)
  }

  const dark = theme === "dark"

  return (
    <button
      onClick={toggle}
      title={dark ? "Světlý režim" : "Tmavý režim"}
      className={cn(
        "flex items-center rounded-lg text-sm w-full text-text-secondary hover:bg-subtle hover:text-text transition-colors",
        collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
      )}
    >
      {dark
        ? <Sun  className="w-4 h-4 shrink-0" />
        : <Moon className="w-4 h-4 shrink-0" />
      }
      {!collapsed && (
        <span className="overflow-hidden whitespace-nowrap">
          {dark ? "Světlý režim" : "Tmavý režim"}
        </span>
      )}
    </button>
  )
}

export default function Sidebar() {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved === "true") setCollapsed(true)
  }, [])

  function toggleCollapse() {
    setCollapsed((v) => {
      localStorage.setItem("sidebar-collapsed", String(!v))
      return !v
    })
  }

  return (
    <aside
      className={cn(
        "group relative shrink-0 flex flex-col h-screen bg-surface border-r border-border overflow-visible",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      <button
        onClick={toggleCollapse}
        aria-label={collapsed ? "Rozbalit sidebar" : "Sbalit sidebar"}
        className={cn(
          "absolute -right-3 top-[16px] z-50",
          "w-6 h-6 rounded-full bg-surface border border-border shadow-sm",
          "flex items-center justify-center",
          "text-text-secondary hover:text-text hover:bg-subtle transition-colors",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        )}
      >
        <ChevronLeft
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-200",
            collapsed && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "flex items-center h-14 border-b border-border shrink-0 overflow-hidden",
          collapsed ? "justify-center px-0" : "gap-2.5 px-5"
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <ReceiptText className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-bold text-text tracking-tight whitespace-nowrap overflow-hidden">
            Fakturace
          </span>
        )}
      </div>

      <div className={cn("pt-4 pb-2 shrink-0", collapsed ? "px-2" : "px-3")}>
        <Link
          href="/invoice/new"
          title={collapsed ? "Nová faktura" : undefined}
          className={cn(
            "flex items-center justify-center w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors",
            !collapsed && "gap-2"
          )}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Nová faktura</span>}
        </Link>
      </div>

      <nav className={cn("flex-1 py-2 overflow-y-auto overflow-x-hidden", collapsed ? "px-2" : "px-3")}>
        {!collapsed && (
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest px-2 mb-1">
            Nabídka
          </p>
        )}
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center rounded-lg text-sm transition-colors",
                    collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                    active
                      ? "bg-subtle text-text font-semibold"
                      : "text-text-secondary hover:bg-subtle hover:text-text"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
                  {!collapsed && (
                    <span className="whitespace-nowrap overflow-hidden">{label}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className={cn(
        "pb-4 border-t border-border pt-3 shrink-0 space-y-0.5",
        collapsed ? "px-2" : "px-3"
      )}>
        {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm transition-colors",
                collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                active
                  ? "bg-subtle text-text font-semibold"
                  : "text-text-secondary hover:bg-subtle hover:text-text"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden">{label}</span>
              )}
            </Link>
          )
        })}

        <DarkModeToggle collapsed={collapsed} />
      </div>
    </aside>
  )
}
