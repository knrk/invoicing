"use client"

import { readFileAsBase64, validatePdfFile } from "@/components/costs/pdf-file"
import { Button } from "@/components/ui/button"
import { getCostFileUrl, getCostHtml, uploadCostFile } from "@/lib/costs"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface Props {
  costId: string
  hasFile: boolean
  fileName: string | null
}

export default function CostFilePreview({ costId, hasFile, fileName }: Props) {
  const router = useRouter()
  const isHtml = (fileName ?? "").toLowerCase().endsWith(".html")
  const [url, setUrl] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(hasFile)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    if (!hasFile) {
      setUrl(null)
      setHtml(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const fetcher = isHtml
      ? getCostHtml(costId).then((res) => {
          if (res.html != null) setHtml(res.html)
          else setError(res.error ?? "Nepodařilo se načíst soubor")
        })
      : getCostFileUrl(costId).then((res) => {
          if (res.url) setUrl(res.url)
          else setError(res.error ?? "Nepodařilo se načíst soubor")
        })
    fetcher.finally(() => setLoading(false))
  }, [costId, hasFile, isHtml])

  useEffect(() => {
    load()
  }, [load])

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

  const frameClass = "h-[600px] w-full rounded-xl border border-border bg-white"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">Příloha</span>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Nahrávám…" : hasFile ? "Vyměnit za PDF" : "Nahrát PDF"}
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
      ) : error ? (
        <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-danger">
          {error}
        </div>
      ) : isHtml && html != null ? (
        <iframe
          title="Náhled faktury"
          srcDoc={html}
          sandbox=""
          className={frameClass}
        />
      ) : url ? (
        <iframe title="Náhled faktury" src={url} className={frameClass} />
      ) : (
        <div className="flex h-[600px] items-center justify-center rounded-xl border border-border bg-surface text-sm text-danger">
          Náhled není k dispozici
        </div>
      )}
    </div>
  )
}
