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
import { Pencil, Trash2, Plus, Globe, Building2 } from "lucide-react"

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

  const editingCustomer = customers.find((c) => c.id === editingId)

  return (
    <div>
      {error && (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <Button variant="dark" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Přidat odběratele
        </Button>
      </div>

      {/* List */}
      {customers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Zatím žádní odběratelé. Přidejte prvního.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditingId(c.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setEditingId(c.id)}
              className="group flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 cursor-pointer hover:border-ring/50 hover:bg-subtle transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle group-hover:bg-background text-text-secondary transition-colors">
                  {c.language === "en"
                    ? <Globe className="h-4 w-4" />
                    : <Building2 className="h-4 w-4" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">{c.name}</p>
                  <p className="text-xs text-text-secondary">
                    {[c.ico && `IČ ${c.ico}`, c.city, c.country !== "CZ" && c.country]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setEditingId(c.id) }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(c.id) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nový odběratel</DialogTitle>
          </DialogHeader>
          <CustomerForm onDone={() => { setAddOpen(false); router.refresh() }} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
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

      {/* Delete confirm */}
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
