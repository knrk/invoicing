"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CustomerRecord } from "@/types"
import { deleteCustomer } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import CustomerForm from "./CustomerForm"
import { MoreVertical, Pencil, Trash2, Plus, Globe, Building2 } from "lucide-react"

interface Props {
  customers: CustomerRecord[]
}


export default function CustomerListClient({ customers }: Props) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    setError(null)
    const result = await deleteCustomer(id)
    setDeleting(null)
    setConfirmDelete(null)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  function hideMenu(id: string) {
    ;(document.getElementById(`ctx-${id}`) as HTMLElement & { hidePopover(): void })?.hidePopover()
  }

  function positionMenu(id: string) {
    const trigger = document.getElementById(`trigger-${id}`)
    const menu = document.getElementById(`ctx-${id}`)
    if (!trigger || !menu) return
    const r = trigger.getBoundingClientRect()
    menu.style.top = `${r.bottom + 4}px`
    menu.style.right = `${window.innerWidth - r.right}px`
  }

  const editingCustomer = customers.find((c) => c.id === editingId)

  return (
    <div>
      {error && (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-4 gap-3">

        <button
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-transparent px-4 py-8 text-text-secondary hover:border-ring/50 hover:text-text hover:bg-subtle transition-colors cursor-pointer min-h-[110px]"
        >
          <Plus className="h-5 w-5" />
          <span className="text-xs font-medium">Přidat odběratele</span>
        </button>

        {customers.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setEditingId(c.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setEditingId(c.id)}
            onMouseLeave={() => hideMenu(c.id)}
            className="group relative flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4 cursor-pointer hover:border-ring/50 hover:bg-subtle transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle group-hover:bg-background text-text-secondary transition-colors shrink-0">
                {c.language === "en"
                  ? <Globe className="h-4 w-4" />
                  : <Building2 className="h-4 w-4" />
                }
              </div>

              <button
                id={`trigger-${c.id}`}
                {...{ popoverTarget: `ctx-${c.id}` }}
                onClick={(e) => { e.stopPropagation(); positionMenu(c.id) }}
                className="p-1 rounded text-text-secondary hover:text-text hover:bg-border transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold text-text leading-snug">{c.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {[c.ico && `IČ ${c.ico}`, c.city, c.country !== "CZ" && c.country]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div
              id={`ctx-${c.id}`}
              {...{ popover: "auto" }}
              data-ctx-menu
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg py-1 min-w-[148px]"
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text hover:bg-subtle transition-colors"
                onClick={() => { hideMenu(c.id); setEditingId(c.id) }}
              >
                <Pencil className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                Upravit
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-danger hover:bg-subtle transition-colors"
                onClick={() => { hideMenu(c.id); setConfirmDelete(c.id) }}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Smazat
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nový odběratel</DialogTitle>
          </DialogHeader>
          <CustomerForm onDone={() => { setAddOpen(false); router.refresh() }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit odběratele</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <CustomerForm
              existing={editingCustomer}
              onDone={() => { setEditingId(null); router.refresh() }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat odběratele?</DialogTitle>
            <DialogDescription>Tato akce je nevratná.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Zrušit</Button>
            <Button
              variant="destructive"
              disabled={!!deleting}
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {deleting ? "Mažu…" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
