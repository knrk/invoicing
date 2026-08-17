"use client"

import CostForm, { emptyCostForm } from "@/components/costs/CostForm"
import {
  Dialog,
  DialogContent,
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
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const initial: CostFormData = { ...emptyCostForm(), received_date: today() }

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

  async function handleSubmit(form: CostFormData): Promise<{ error?: string }> {
    const created = await createCost(form)
    if (created.error || !created.data) {
      return { error: created.error ?? "Nepodařilo se vytvořit náklad" }
    }
    if (file) {
      try {
        const base64 = await readFileAsBase64(file)
        const up = await uploadCostFile(created.data.id, file.name, base64)
        if (up.error) {
          // Náklad je vytvořen, jen se nepodařilo nahrát PDF — nenech to spadnout tiše.
          toast.error("Náklad uložen, ale PDF se nenahrálo", { description: up.error })
        }
      } catch (err) {
        toast.error("Náklad uložen, ale PDF se nenahrálo", {
          description: err instanceof Error ? err.message : "Chyba čtení souboru",
        })
      }
    }
    toast.success("Náklad přidán")
    setFile(null)
    if (inputRef.current) inputRef.current.value = ""
    onSaved()
    return {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový náklad</DialogTitle>
        </DialogHeader>

        <div className="mb-2">
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

        <CostForm
          initial={initial}
          submitLabel="Přidat náklad"
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
