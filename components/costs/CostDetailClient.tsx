"use client"

import CostFilePreview from "@/components/costs/CostFilePreview"
import CostForm from "@/components/costs/CostForm"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteCost, setCostPaidAt, updateCost } from "@/lib/costs"
import { today } from "@/lib/invoice"
import type { Cost, CostFormData } from "@/types"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

interface Props {
  cost: Cost
}

function costToForm(cost: Cost): CostFormData {
  return {
    supplier: cost.supplier,
    invoice_number: cost.invoice_number,
    variable_symbol: cost.variable_symbol,
    currency: cost.currency,
    issue_date: cost.issue_date,
    due_date: cost.due_date,
    received_date: cost.received_date,
    total: cost.total,
    vat_amount: cost.vat_amount,
    reverse_charge: cost.reverse_charge,
    is_eu_supplier: cost.is_eu_supplier,
    note: cost.note,
    source: cost.source,
  }
}

export default function CostDetailClient({ cost }: Props) {
  const router = useRouter()
  const [paid, setPaid] = useState<boolean>(!!cost.paid_at)
  const [togglingPaid, setTogglingPaid] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSubmit(form: CostFormData): Promise<{ error?: string }> {
    const result = await updateCost(cost.id, form)
    if (!result.error) {
      toast.success("Náklad uložen")
      router.refresh()
    }
    return result
  }

  async function togglePaid() {
    setTogglingPaid(true)
    const next = paid ? null : today()
    const result = await setCostPaidAt(cost.id, next)
    setTogglingPaid(false)
    if (result.error) {
      toast.error("Chyba", { description: result.error })
    } else {
      setPaid(!paid)
      router.refresh()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteCost(cost.id)
    if (result.error) {
      setDeleting(false)
      toast.error("Chyba při mazání", { description: result.error })
      return
    }
    router.push("/costs")
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => router.push("/costs")}>
          ← Zpět
        </Button>
        <div className="flex items-center gap-2">
          <Button variant={paid ? "outline" : "dark"} size="sm" onClick={togglePaid} disabled={togglingPaid}>
            {togglingPaid ? "…" : paid ? "Zrušit zaplaceno" : "Označit zaplaceno"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            Smazat
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <CostForm
            initial={costToForm(cost)}
            submitLabel="Uložit změny"
            onSubmit={handleSubmit}
          />
        </div>
        <CostFilePreview costId={cost.id} hasFile={!!cost.file_path} />
      </div>

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat náklad?</DialogTitle>
            <DialogDescription>Tato akce je nevratná. Smaže i připojené PDF.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Zrušit
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Mažu…" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
