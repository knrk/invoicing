"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

type Theme = "light" | "dark"

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("theme")
    const resolved: Theme = saved === "light" || saved === "dark" ? saved : getSystemTheme()
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
      type="button"
      onClick={toggle}
      aria-label={dark ? "Světlý režim" : "Tmavý režim"}
      title={dark ? "Světlý režim" : "Tmavý režim"}
      className="auth-tab auth-focus z-10 flex size-10 items-center justify-center text-[var(--auth-muted)] hover:text-[var(--auth-text)]"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}
