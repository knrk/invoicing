"use client"

import { getCostFileUrl } from "@/lib/costs"
import { useEffect, useState } from "react"

interface Props {
  costId: string
  hasFile: boolean
}

export default function CostFilePreview({ costId, hasFile }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(hasFile)

  useEffect(() => {
    if (!hasFile) return
    let active = true
    setLoading(true)
    getCostFileUrl(costId).then((res) => {
      if (!active) return
      if (res.url) setUrl(res.url)
      else setError(res.error ?? "Nepodařilo se načíst soubor")
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [costId, hasFile])

  if (!hasFile) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-dashed border-border bg-surface text-sm text-text-secondary">
        Bez přílohy
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-secondary">
        Načítám náhled…
      </div>
    )
  }

  if (error || !url) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-danger">
        {error ?? "Náhled není k dispozici"}
      </div>
    )
  }

  return (
    <iframe
      title="Náhled faktury"
      src={url}
      className="h-[600px] w-full rounded-xl border border-border bg-surface"
    />
  )
}
