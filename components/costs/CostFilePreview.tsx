"use client"

import { readFileAsBase64, validatePdfFile } from "@/components/costs/pdf-file"
import { Button } from "@/components/ui/button"
import { getCostFileUrl, uploadCostFile } from "@/lib/costs"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface Props {
  costId: string
  hasFile: boolean
}

export default function CostFilePreview({ costId, hasFile }: Props) {
  const router = useRouter()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(hasFile)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!hasFile) {
      setUrl(null)
      setLoading(false)
      return
    }
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const validationError = validatePdfFile(file)
    if (validationError) {
      toast.error("Soubor nelze nahrát", { description: validationError })
      return
    }
    setUploading(true)
    try {
      const base64 = await readFileAsBase64(file)
      const result = await uploadCostFile(costId, file.name, base64)
      if (result.error) {
        toast.error("Nahrání PDF selhalo", { description: result.error })
      } else {
        toast.success("PDF nahráno")
        router.refresh()
      }
    } catch (err) {
      toast.error("Nahrání PDF selhalo", {
        description: err instanceof Error ? err.message : "Chyba čtení souboru",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">Příloha (PDF)</span>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Nahrávám…" : hasFile ? "Vyměnit PDF" : "Nahrát PDF"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {!hasFile ? (
        <div className="flex h-[600px] items-center justify-center rounded-xl border border-dashed border-border bg-surface text-sm text-text-secondary">
          Bez přílohy
        </div>
      ) : loading ? (
        <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-secondary">
          Načítám náhled…
        </div>
      ) : error || !url ? (
        <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-danger">
          {error ?? "Náhled není k dispozici"}
        </div>
      ) : (
        <iframe
          title="Náhled faktury"
          src={url}
          className="h-[600px] w-full rounded-xl border border-border bg-surface"
        />
      )}
    </div>
  )
}
