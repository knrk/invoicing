"use client"

import CostForm, { emptyCostForm } from "@/components/costs/CostForm"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { createCost, uploadCostFile } from "@/lib/costs"
import { today } from "@/lib/invoice"
import type { CostFormData } from "@/types"
import { useRef, useState } from "react"
import { toast } from "sonner"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

// Přečte soubor jako base64 bez data: prefixu.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Nepodařilo se přečíst soubor"))
    reader.readAsDataURL(file)
  })
}

export default function CostUploadDialog({ open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<CostFormData>(() => ({
    ...emptyCostForm(),
    received_date: today(),
  }))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setForm({ ...emptyCostForm(), received_date: today() })
    setFile(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && f.type !== "application/pdf") {
      toast.error("Nepodporovaný formát", { description: "Nahraj prosím PDF." })
      e.target.value = ""
      return
    }
    if (f && f.size > MAX_SIZE) {
      toast.error("Soubor je příliš velký", { description: "Maximální velikost je 10 MB." })
      e.target.value = ""
      return
    }
    setFile(f)
  }

  async function handleSubmit() {
    setSaving(true)
    const created = await createCost(form)
    if (created.error || !created.data) {
      setSaving(false)
      toast.error("Chyba při ukládání", { description: created.error ?? "Nepodařilo se vytvořit náklad" })
      return
    }
    if (file) {
      try {
        const base64 = await readFileAsBase64(file)
        const up = await uploadCostFile(created.data.id, file.name, base64)
        if (up.error) {
          toast.error("Náklad uložen, ale PDF se nenahrálo", { description: up.error })
        }
      } catch (err) {
        toast.error("Náklad uložen, ale PDF se nenahrálo", {
          description: err instanceof Error ? err.message : "Chyba čtení souboru",
        })
      }
    }
    setSaving(false)
    toast.success("Náklad přidán")
    reset()
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[35rem] flex-col overflow-hidden p-0">
        <DialogHeader className="mb-0 shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>Nový náklad</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <Label htmlFor="cost-file">PDF faktury</Label>
            <input
              id="cost-file"
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-subtle file:px-3 file:py-1.5 file:text-text hover:file:bg-background"
            />
          </div>
          <CostForm value={form} onChange={setForm} />
        </div>

        <DialogFooter className="mt-0 shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Zrušit
          </Button>
          <Button variant="dark" onClick={handleSubmit} disabled={saving}>
            {saving ? "Ukládám…" : "Přidat náklad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
