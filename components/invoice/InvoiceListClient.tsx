"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { deleteInvoice, duplicateInvoice, setInvoicePaidAt } from "@/lib/actions"
import { fmtNum, today } from "@/lib/invoice"
import { exportAllToPDF } from "@/lib/pdf"
import { cn } from "@/lib/utils"
import type { AppConfig, Invoice } from "@/types"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

function fmtDateCs(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return `${String(d).padStart(2, "0")}. ${String(m).padStart(2, "0")}. ${y}`
}

function isOverdue14(dueDateStr: string): boolean {
  const [y, m, d] = dueDateStr.split("-").map(Number)
  const due = new Date(y, m - 1, d)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  return due < cutoff
}

function isPastDue(dueDateStr: string): boolean {
  const [y, m, d] = dueDateStr.split("-").map(Number)
  const due = new Date(y, m - 1, d)
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  return due < todayDate
}

interface Props {
  invoices: Invoice[]
  config: AppConfig | null
}

export default function InvoiceListClient({ invoices, config }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleExportAll() {
    if (!config || invoices.length === 0) return
    setExportProgress({ done: 0, total: invoices.length })
    try {
      await exportAllToPDF(invoices, config, (done, total) => setExportProgress({ done, total }))
    } finally {
      setExportProgress(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const result = await deleteInvoice(id)
    setDeleting(null)
    setConfirmDelete(null)
    if (result.error) {
      toast.error("Chyba při mazání faktury", { description: result.error })
    } else {
      router.refresh()
    }
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id)
    try {
      const result = await duplicateInvoice(id)
      if (result.error) {
        toast.error("Chyba při duplikování faktury", { description: result.error })
      } else if (result.data) {
        router.push(`/invoice/${result.data.id}`)
      }
    } catch (err) {
      toast.error("Chyba při duplikování faktury", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setDuplicating(null)
    }
  }

  const currentYear = new Date().getFullYear()

  const yearCzk = invoices
    .filter((inv) => inv.currency === "CZK" && inv.issue_date.startsWith(String(currentYear)))
    .reduce((sum, inv) => sum + inv.total, 0)

  const yearEur = invoices
    .filter((inv) => inv.currency === "EUR" && inv.issue_date.startsWith(String(currentYear)))
    .reduce((sum, inv) => sum + inv.total, 0)

  const overdueInvoices = invoices.filter((inv) => !inv.paid_at && isPastDue(inv.due_date))
  const overdueCountCzk = overdueInvoices.filter((inv) => inv.currency === "CZK").length
  const overdueCountEur = overdueInvoices.filter((inv) => inv.currency === "EUR").length
  const overdueAmountCzk = overdueInvoices
    .filter((inv) => inv.currency === "CZK")
    .reduce((sum, inv) => sum + inv.total, 0)
  const overdueAmountEur = overdueInvoices
    .filter((inv) => inv.currency === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0)

  if (invoices.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-[22px] font-bold text-text">Faktury</h1>
          <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
            0
          </span>
        </div>
        <div className="bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-4xl">📄</span>
          <p className="text-sm text-text-secondary">Zatím žádné faktury</p>
          <Button asChild className="mt-1">
            <a href="/invoice/new">Vytvořit první fakturu</a>
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-bold text-text">Faktury</h1>
          <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
            {invoices.length}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAll}
          disabled={!!exportProgress || invoices.length === 0 || !config}
        >
          {exportProgress
            ? `Generuji ${exportProgress.done} / ${exportProgress.total}…`
            : "Exportovat vše (ZIP)"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={`Fakturace ${currentYear} — CZK`} value={`${fmtNum(yearCzk)} Kč`} />
        <StatCard
          label={`Fakturace ${currentYear} — €`}
          value={yearEur > 0 ? `${fmtNum(yearEur)} €` : "—"}
        />
        <StatCard
          label="Po splatnosti"
          danger={overdueInvoices.length > 0}
          value={
            overdueInvoices.length === 0
              ? "Vše v pořádku"
              : [
                  overdueCountCzk > 0
                    ? `${overdueCountCzk} × ${fmtNum(overdueAmountCzk)} Kč`
                    : null,
                  overdueCountEur > 0 ? `${overdueCountEur} × ${fmtNum(overdueAmountEur)} €` : null,
                ]
                  .filter(Boolean)
                  .join(" / ")
          }
        />
      </div>

      <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Číslo", "Odběratel", "Částka", "Splatnost / Zaplaceno", ""].map((h) => (
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
                  <span className="inline-flex items-center gap-1.5">
                    {inv.invoice_number.replace(/^[A-Za-z]+/, "")}
                    <Badge
                      variant={inv.language === "cs" ? "blue" : "green"}
                      className="text-[8px] px-1 py-0 leading-tight font-sans font-semibold"
                    >
                      {inv.language === "cs" ? "CZ" : "EN"}
                    </Badge>
                  </span>
                </TableCell>
                <TableCell className="text-text">{inv.customer.name || "—"}</TableCell>
                <TableCell className="font-medium tabular-nums text-text">
                  {fmtNum(inv.total)} {inv.currency === "CZK" ? "Kč" : "€"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DuePaidCell invoice={inv} />
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
                      className="text-danger hover:text-danger hover:bg-danger/10"
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

function StatCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-5 py-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={cn("text-[18px] font-bold tabular-nums", danger ? "text-danger" : "text-text")}>
        {value}
      </p>
    </div>
  )
}

function DuePaidCell({ invoice }: { invoice: Invoice }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  async function handleSelect(date: string) {
    setSaving(true)
    setOpen(false)
    await setInvoicePaidAt(invoice.id, date)
    setSaving(false)
    router.refresh()
  }

  async function handleClear() {
    setSaving(true)
    await setInvoicePaidAt(invoice.id, null)
    setSaving(false)
    router.refresh()
  }

  if (saving) {
    return <span className="text-sm text-text-secondary">...</span>
  }

  if (invoice.paid_at) {
    return (
      <button
        onClick={handleClear}
        title="Kliknutím zrušit označení zaplaceno"
        className="text-sm font-medium text-emerald-600 hover:text-danger transition-colors tabular-nums"
      >
        {fmtDateCs(invoice.paid_at)}
      </button>
    )
  }

  const overdue = isOverdue14(invoice.due_date)

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <span
        className={cn(
          "text-sm tabular-nums",
          overdue ? "font-bold text-danger" : "text-text-secondary"
        )}
      >
        {fmtDateCs(invoice.due_date)}
      </span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-primary hover:underline text-left w-fit"
      >
        Označit jako zaplaceno
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <Calendar selected={today()} onSelect={handleSelect} />
        </div>
      )}
    </div>
  )
}
