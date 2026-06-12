"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"

type Theme = "light" | "dark"

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  // On mount: read saved preference or fall back to system
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

  // Render nothing until we know the theme (avoids flash)
  if (theme === null) return <div className="w-8 h-8" />

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}>
      {theme === "dark"
        ? <Sun className="h-4 w-4" />
        : <Moon className="h-4 w-4" />
      }
    </Button>
  )
}
