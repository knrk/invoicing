"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { deleteInvoice, duplicateInvoice, setInvoicePaidAt } from "@/lib/actions"
import { fmtNum, today } from "@/lib/invoice"
import { exportAllToPDF } from "@/lib/pdf"
import { cn } from "@/lib/utils"
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { invoiceYear } from "@/lib/year-filter"
import type { AppConfig, Invoice } from "@/types"
import { CopySlash, FileText, HandCoins, LoaderCircle, Trash2 } from "lucide-react"
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
  dbError?: boolean
}

export default function InvoiceListClient({ invoices, config, dbError }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [status, setStatus] = useState<"all" | "unpaid" | "paid">("all")
  const { year } = useYearFilter()
  const yearInvoices = invoices.filter((inv) => invoiceYear(inv) === year)

  async function handleExportAll() {
    if (!config || yearInvoices.length === 0) return
    setExportProgress({ done: 0, total: yearInvoices.length })
    try {
      await exportAllToPDF(yearInvoices, config, (done, total) => setExportProgress({ done, total }))
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

  const yearCzk = yearInvoices
    .filter((inv) => inv.currency === "CZK")
    .reduce((sum, inv) => sum + inv.total, 0)

  const yearEur = yearInvoices
    .filter((inv) => inv.currency === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0)

  const unpaidInvoices = yearInvoices.filter((inv) => !inv.paid_at)
  const expectedAmountCzk = unpaidInvoices
    .filter((inv) => inv.currency === "CZK")
    .reduce((sum, inv) => sum + inv.total, 0)
  const expectedAmountEur = unpaidInvoices
    .filter((inv) => inv.currency === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0)
  const expectedAmount =
    [
      expectedAmountCzk > 0 ? `${fmtNum(expectedAmountCzk)} Kč` : null,
      expectedAmountEur > 0 ? `${fmtNum(expectedAmountEur)} €` : null,
    ]
      .filter(Boolean)
      .join(" / ") || "—"

  const overdueInvoices = yearInvoices.filter((inv) => !inv.paid_at && isPastDue(inv.due_date))
  const overdueCountCzk = overdueInvoices.filter((inv) => inv.currency === "CZK").length
  const overdueCountEur = overdueInvoices.filter((inv) => inv.currency === "EUR").length
  const overdueAmountCzk = overdueInvoices
    .filter((inv) => inv.currency === "CZK")
    .reduce((sum, inv) => sum + inv.total, 0)
  const overdueAmountEur = overdueInvoices
    .filter((inv) => inv.currency === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0)

  const filtered = yearInvoices.filter((inv) => {
    if (status === "unpaid") return !inv.paid_at
    if (status === "paid") return !!inv.paid_at
    return true
  })

  if (yearInvoices.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
          <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
            0
          </span>
        </div>
        {dbError ? (
          <div className="flex items-start gap-3 p-4 text-sm text-warning-text bg-warning-bg border border-warning-border rounded-lg">
            <span className="text-base leading-none">⚠️</span>
            <div className="space-y-1">
              <p className="font-medium">Nepodařilo se načíst faktury z databáze.</p>
              <p>
                Databáze na Supabase mohla být uspána z důvodu neaktivity. Obnovte ji ručně v{" "}
                <a
                  href="https://supabase.com/dashboard/projects"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Supabase dashboardu
                </a>{" "}
                a poté stránku načtěte znovu.
              </p>
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <Empty className="border border-dashed border-border bg-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>Zatím žádné faktury</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <a href="/invoice/new">Vytvořit první fakturu</a>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="border border-dashed border-border bg-surface">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>Žádné faktury v roce {year}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2.5 mb-8">
        <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
        <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
          {yearInvoices.length}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={`Fakturace ${year} — CZK`} value={`${fmtNum(yearCzk)} Kč`} />
        <StatCard
          label={`Fakturace ${year} — €`}
          value={yearEur > 0 ? `${fmtNum(yearEur)} €` : "—"}
        />
        <StatCard
          label="Očekávaná platba"
          value={
            <>
              {expectedAmount}
              <span className="ml-1.5 text-sm font-normal text-text-secondary">
                / {unpaidInvoices.length}
              </span>
            </>
          }
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(["all", "unpaid", "paid"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-text-secondary hover:bg-subtle hover:text-text"
              )}
            >
              {s === "all" ? "Vše" : s === "unpaid" ? "Nezaplacené" : "Zaplacené"}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAll}
          disabled={!!exportProgress || yearInvoices.length === 0 || !config}
        >
          {exportProgress
            ? `Generuji ${exportProgress.done} / ${exportProgress.total}…`
            : "Export ZIP"}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Empty className="border border-dashed border-border bg-surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Žádné faktury neodpovídají filtru</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
      <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Odběratel</TableHead>
              <TableHead>Splatnost / Zaplaceno</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead className="text-right">Částka</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((inv) => {
              const overdueRow = !inv.paid_at && isPastDue(inv.due_date)
              return (
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
                <TableCell className="py-4">
                  <div className="font-semibold text-text">{inv.customer.name || "—"}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-text-secondary">
                    {inv.invoice_number.replace(/^[A-Za-z]+/, "")}
                    <Badge
                      variant={inv.language === "cs" ? "blue" : "green"}
                      className="rounded px-1 py-0 text-[10px] font-sans font-semibold leading-tight normal-case tracking-normal"
                    >
                      {inv.language === "cs" ? "CZ" : "EN"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DuePaidCell invoice={inv} />
                </TableCell>
                <TableCell>
                  {inv.paid_at ? (
                    <Badge variant="green" className="rounded-full normal-case tracking-normal">
                      Zaplaceno
                    </Badge>
                  ) : overdueRow ? (
                    <Badge variant="red" className="rounded-full normal-case tracking-normal">
                      Po splatnosti
                    </Badge>
                  ) : (
                    <Badge variant="blue" className="rounded-full normal-case tracking-normal">
                      Nezaplaceno
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-text">
                  {fmtNum(inv.total)} {inv.currency === "CZK" ? "Kč" : "€"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(inv.id)}
                            disabled={duplicating === inv.id}
                            className="cursor-pointer"
                          >
                            {duplicating === inv.id ? (
                              <LoaderCircle size={16} className="animate-spin" />
                            ) : (
                              <CopySlash size={16} />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplikovat</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDelete(inv.id)}
                            className="cursor-pointer text-danger hover:text-danger hover:bg-danger/10"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Smazat</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      )}

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

function StatCard({
  label,
  value,
  danger,
}: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-5 py-4 shadow-elevated">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", danger ? "text-danger" : "text-text")}>
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
        className="text-xs font-medium text-emerald-600 hover:text-danger transition-colors tabular-nums"
      >
        {fmtDateCs(invoice.paid_at)}
      </button>
    )
  }

  const overdue = isOverdue14(invoice.due_date)

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span
        className={cn(
          "text-xs tabular-nums",
          overdue ? "font-bold text-danger" : "text-text-secondary"
        )}
      >
        {fmtDateCs(invoice.due_date)}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-fit cursor-pointer text-primary transition-opacity hover:opacity-70"
            >
              <HandCoins size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Označit jako zaplaceno</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <Calendar selected={today()} onSelect={handleSelect} />
        </div>
      )}
    </div>
  )
}
