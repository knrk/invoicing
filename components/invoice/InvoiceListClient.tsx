"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Invoice } from "@/types"
import { formatDate } from "@/lib/invoice"
import { deleteInvoice, duplicateInvoice } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Props {
  invoices: Invoice[]
}

export default function InvoiceListClient({ invoices }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    setActionError(null)
    const result = await deleteInvoice(id)
    setDeleting(null)
    setConfirmDelete(null)
    if (result.error) {
      setActionError(result.error)
    } else {
      router.refresh()
    }
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id)
    setActionError(null)
    try {
      const result = await duplicateInvoice(id)
      if (result.error) {
        setActionError(result.error)
      } else if (result.data) {
        router.push(`/invoice/${result.data.id}`)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setDuplicating(null)
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-20 gap-3">
        <span className="text-4xl">📄</span>
        <p className="text-sm text-text-secondary">Zatím žádné faktury</p>
        <Button asChild className="mt-1">
          <a href="/invoice/new">Vytvořit první fakturu</a>
        </Button>
      </div>
    )
  }

  return (
    <>
      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Číslo", "Odběratel", "Vystaveno", "Splatnost", "Částka", "Jazyk", ""].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow
                key={inv.id}
                className="cursor-pointer"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/invoice/${inv.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/invoice/${inv.id}`)
                }}
              >
                <TableCell className="font-mono font-medium text-text">
                  {inv.invoice_number}
                </TableCell>
                <TableCell className="text-text">
                  {inv.customer.name || "—"}
                </TableCell>
                <TableCell className="text-text-secondary">
                  {formatDate(inv.issue_date, inv.language)}
                </TableCell>
                <TableCell className="text-text-secondary">
                  {formatDate(inv.due_date, inv.language)}
                </TableCell>
                <TableCell className="font-medium tabular-nums text-text">
                  {inv.total.toLocaleString(inv.language === "cs" ? "cs-CZ" : "en-GB")}{" "}
                  {inv.currency}
                </TableCell>
                <TableCell>
                  <Badge variant={inv.language === "cs" ? "blue" : "green"}>
                    {inv.language === "cs" ? "CZ" : "EN"}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicate(inv.id)}
                      disabled={duplicating === inv.id}
                    >
                      {duplicating === inv.id ? "..." : "Duplikovat"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(inv.id)}
                      className="text-danger hover:text-danger hover:bg-red-50"
                    >
                      Smazat
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat fakturu?</DialogTitle>
            <DialogDescription>Tato akce je nevratná.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={deleting === confirmDelete}
            >
              {deleting === confirmDelete ? "Mažu..." : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
