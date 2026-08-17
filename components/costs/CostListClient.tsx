"use client"

import CostUploadDialog from "@/components/costs/CostUploadDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { deleteCost, deleteCosts, exportCostsCsv, exportCostsZip } from "@/lib/costs"
import { syncGmailCosts } from "@/lib/gmail"
import { fmtNum } from "@/lib/invoice"
import { cn } from "@/lib/utils"
import type { Cost } from "@/types"
import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

type StatusFilter = "all" | "unpaid" | "paid"

function symbol(currency: string): string {
  return currency === "EUR" ? "€" : "Kč"
}

function fmtDateCs(dateStr: string): string {
  if (!dateStr) return "—"
  const [y, m, d] = dateStr.split("-").map(Number)
  return `${String(d).padStart(2, "0")}. ${String(m).padStart(2, "0")}. ${y}`
}

function isPastDue(dueDateStr: string): boolean {
  if (!dueDateStr) return false
  const [y, m, d] = dueDateStr.split("-").map(Number)
  const due = new Date(y, m - 1, d)
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  return due < todayDate
}

function sumByCurrency(costs: Cost[]): string {
  const czk = costs.filter((c) => c.currency === "CZK").reduce((s, c) => s + c.total, 0)
  const eur = costs.filter((c) => c.currency === "EUR").reduce((s, c) => s + c.total, 0)
  return (
    [czk > 0 ? `${fmtNum(czk)} Kč` : null, eur > 0 ? `${fmtNum(eur)} €` : null]
      .filter(Boolean)
      .join(" / ") || "—"
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

interface Props {
  costs: Cost[]
  gmailReady?: boolean
}

export default function CostListClient({ costs, gmailReady = false }: Props) {
  const router = useRouter()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [period, setPeriod] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exporting, setExporting] = useState<"csv" | "zip" | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  async function handleGmailSync() {
    setSyncing(true)
    const res = await syncGmailCosts()
    setSyncing(false)
    if (res.error) {
      toast.error("Kontrola Gmailu selhala", { description: res.error })
      return
    }
    toast.success(`Hotovo: ${res.imported} nových, ${res.skipped} přeskočeno`)
    if (res.errors.length) {
      toast.error("Některé přílohy se nenahrály", {
        description: res.errors.slice(0, 3).join("; "),
      })
    }
    router.refresh()
  }

  const filtered = useMemo(
    () =>
      costs.filter((c) => {
        if (status === "unpaid" && c.paid_at) return false
        if (status === "paid" && !c.paid_at) return false
        if (period && !c.issue_date.startsWith(period)) return false
        return true
      }),
    [costs, status, period]
  )

  const unpaid = costs.filter((c) => !c.paid_at)
  const overdue = unpaid.filter((c) => isPastDue(c.due_date))

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (filtered.every((c) => prev.has(c.id))) {
        const next = new Set(prev)
        for (const c of filtered) next.delete(c.id)
        return next
      }
      const next = new Set(prev)
      for (const c of filtered) next.add(c.id)
      return next
    })
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selected]
    const result = await deleteCosts(ids)
    setBulkDeleting(false)
    setConfirmBulk(false)
    if (result.error) {
      toast.error("Hromadné mazání selhalo", { description: result.error })
    } else {
      toast.success(`Smazáno ${result.deleted} nákladů`)
      setSelected(new Set())
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const result = await deleteCost(id)
    setDeleting(null)
    setConfirmDelete(null)
    if (result.error) toast.error("Chyba při mazání nákladu", { description: result.error })
    else router.refresh()
  }

  async function handleExportCsv() {
    setExporting("csv")
    try {
      const { csv, filename } = await exportCostsCsv(period)
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename)
    } catch (err) {
      toast.error("Export CSV selhal", {
        description: err instanceof Error ? err.message : "Neznámá chyba",
      })
    } finally {
      setExporting(null)
    }
  }

  async function handleExportZip() {
    setExporting("zip")
    try {
      const { base64, filename, error } = await exportCostsZip(period)
      if (error || !base64) {
        toast.error("Export ZIP selhal", { description: error ?? "Neznámá chyba" })
        return
      }
      const bytes = base64ToBytes(base64)
      downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }), filename)
    } catch (err) {
      toast.error("Export ZIP selhal", {
        description: err instanceof Error ? err.message : "Neznámá chyba",
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Náklady celkem" value={sumByCurrency(costs)} />
        <StatCard
          label="Nezaplaceno"
          value={
            <>
              {sumByCurrency(unpaid)}
              <span className="ml-1.5 text-sm font-normal text-text-secondary">
                / {unpaid.length}
              </span>
            </>
          }
        />
        <StatCard
          label="Po splatnosti"
          danger={overdue.length > 0}
          value={overdue.length === 0 ? "Vše v pořádku" : sumByCurrency(overdue)}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(["all", "unpaid", "paid"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                status === s
                  ? "bg-subtle font-semibold text-text"
                  : "text-text-secondary hover:bg-subtle hover:text-text"
              )}
            >
              {s === "all" ? "Vše" : s === "unpaid" ? "Nezaplacené" : "Zaplacené"}
            </button>
          ))}
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="ml-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          {period && (
            <button
              onClick={() => setPeriod("")}
              className="text-xs text-text-secondary underline hover:text-text"
            >
              Zrušit filtr
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!!exporting}>
            {exporting === "csv" ? "Exportuji…" : "Export CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportZip} disabled={!!exporting}>
            {exporting === "zip" ? "Exportuji…" : "Export ZIP"}
          </Button>
          {gmailReady && (
            <Button variant="outline" size="sm" onClick={handleGmailSync} disabled={syncing}>
              {syncing ? "Kontroluji…" : "Zkontrolovat Gmail"}
            </Button>
          )}
          <Button variant="dark" size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nahrát fakturu
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-subtle px-4 py-2">
          <span className="text-sm text-text">Vybráno {selected.size}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Zrušit výběr
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmBulk(true)}>
              Smazat vybrané
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface py-20">
          <span className="text-4xl">🧾</span>
          <p className="text-sm text-text-secondary">
            {costs.length === 0 ? "Zatím žádné náklady" : "Žádné náklady neodpovídají filtru"}
          </p>
          {costs.length === 0 && (
            <Button variant="dark" size="sm" className="mt-1" onClick={() => setUploadOpen(true)}>
              Nahrát první fakturu
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Vybrat vše"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                </TableHead>
                {["Dodavatel", "Číslo", "Vystaveno", "Splatnost", "Celkem", "Stav", ""].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const overdueRow = !c.paid_at && isPastDue(c.due_date)
                return (
                  <TableRow
                    key={c.id}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/costs/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") router.push(`/costs/${c.id}`)
                    }}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Vybrat ${c.supplier.name || c.invoice_number || c.id}`}
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </TableCell>
                    <TableCell className="text-text">{c.supplier.name || "—"}</TableCell>
                    <TableCell className="font-mono text-text">{c.invoice_number || "—"}</TableCell>
                    <TableCell className="tabular-nums text-text-secondary">
                      {fmtDateCs(c.issue_date)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        overdueRow ? "font-semibold text-danger" : "text-text-secondary"
                      )}
                    >
                      {fmtDateCs(c.due_date)}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums text-text">
                      {fmtNum(c.total)} {symbol(c.currency)}
                    </TableCell>
                    <TableCell>
                      {c.paid_at ? (
                        <Badge variant="green">Zaplaceno</Badge>
                      ) : overdueRow ? (
                        <Badge variant="red">Po splatnosti</Badge>
                      ) : (
                        <Badge variant="blue">Nezaplaceno</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(c.id)}
                          className="cursor-pointer text-danger hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CostUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={() => {
          setUploadOpen(false)
          router.refresh()
        }}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat náklad?</DialogTitle>
            <DialogDescription>Tato akce je nevratná. Smaže i připojené PDF.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Zrušit
            </Button>
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

      <Dialog open={confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat {selected.size} nákladů?</DialogTitle>
            <DialogDescription>
              Tato akce je nevratná. Smaže i připojená PDF.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulk(false)}>
              Zrušit
            </Button>
            <Button variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete}>
              {bulkDeleting ? "Mažu…" : `Smazat ${selected.size}`}
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
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-elevated">
      <p className="mb-1 text-xs text-text-secondary">{label}</p>
      <p className={cn("text-[18px] font-bold tabular-nums", danger ? "text-danger" : "text-text")}>
        {value}
      </p>
    </div>
  )
}
