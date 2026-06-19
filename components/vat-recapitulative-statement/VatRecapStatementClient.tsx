"use client"

import { useState } from "react"
import { exportVatRecapStatementXml } from "@/lib/actions"
import { toast } from "sonner"
import type { VatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import { Download, CheckCircle2, Circle, AlertCircle, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

const CZ_MONTHS = [
  "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]

const EXCLUDE_REASON_LABEL: Record<string, string> = {
  missing_vat: "chybí DIČ odběratele",
  not_eu: "odběratel není z EU",
  not_eur_currency: "faktura není v EUR",
}

interface MonthEntry {
  rok: number
  mesic: number
  data: VatRecapStatementData | null
  error: string | null
}

interface Props {
  months: MonthEntry[]
  configMissing: boolean
}

export default function VatRecapStatementClient({ months, configMissing }: Props) {
  const [exporting, setExporting] = useState<string | null>(null)

  if (configMissing) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-warning-text bg-warning-bg border border-warning-border rounded-lg">
        ⚠️ Nejprve nastavte údaje v{" "}
        <a href="/settings" className="underline font-medium">
          Nastavení
        </a>
        , včetně daňových údajů (kód FÚ, DIČ).
      </div>
    )
  }

  async function handleExport(rok: number, mesic: number) {
    const key = `${rok}-${mesic}`
    setExporting(key)
    const result = await exportVatRecapStatementXml(rok, mesic)
    setExporting(null)
    if (result.error) {
      toast.error("Chyba při exportu XML", { description: result.error })
      return
    }
    const blob = new Blob([result.xml ?? ""], { type: "application/xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = result.filename ?? "vat-recapitulative-statement.xml"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("XML souhrnného hlášení staženo")
  }

  return (
    <div className="space-y-3">
      {months.map(({ rok, mesic, data, error }) => {
        const key = `${rok}-${mesic}`
        const needed = data !== null && data.rows.length > 0
        const isExporting = exporting === key
        const totalCzk = data?.rows.reduce((s, r) => s + r.pln_hodnota, 0) ?? 0
        const invoiceCount = data?.invoices.length ?? 0

        // Excluded invoices that should be flagged (EU-adjacent issues only)
        const euExcluded = data?.excluded.filter((e) => e.reason !== "not_eur_currency") ?? []
        const hasWarning = euExcluded.length > 0

        return (
          <div key={key} className="flex flex-col gap-0">
            <div
              className={cn(
                "flex items-center gap-4 px-5 py-4 rounded-xl border transition-colors",
                error
                  ? "bg-surface border-border"
                  : needed
                    ? "bg-surface border-border"
                    : hasWarning
                      ? "bg-surface border-border"
                      : "bg-subtle border-transparent opacity-60"
              )}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {error ? (
                  <AlertCircle className="w-5 h-5 text-danger" />
                ) : needed ? (
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                ) : hasWarning ? (
                  <TriangleAlert className="w-5 h-5 text-warning-text" />
                ) : (
                  <Circle className="w-5 h-5 text-muted" />
                )}
              </div>

              {/* Month label */}
              <div className="w-36 shrink-0">
                <span className="text-sm font-semibold text-text">
                  {CZ_MONTHS[mesic]} {rok}
                </span>
              </div>

              {/* Status text */}
              <div className="flex-1 text-sm text-text-secondary">
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : needed ? (
                  <>
                    <span className="font-medium text-text">{invoiceCount}</span>{" "}
                    {invoiceCount === 1 ? "faktura" : invoiceCount < 5 ? "faktury" : "faktur"} ·{" "}
                    <span className="font-medium text-text">
                      {totalCzk.toLocaleString("cs-CZ")} Kč
                    </span>{" "}
                    · {data?.rows.length ?? 0}{" "}
                    {(data?.rows.length ?? 0) === 1 ? "příjemce" : "příjemci"}
                    {hasWarning && (
                      <span className="ml-2 text-warning-text">
                        · {euExcluded.length} vyloučeno
                      </span>
                    )}
                  </>
                ) : hasWarning ? (
                  <span className="text-warning-text">
                    {euExcluded.length}{" "}
                    {euExcluded.length === 1 ? "faktura vyloučena" : "faktury vyloučeny"} — zkontrolujte níže
                  </span>
                ) : (
                  <span>Žádné EUR faktury odběratelům z EU — hlášení se nepodává</span>
                )}
              </div>

              {/* Export button */}
              {needed && !error && (
                <button
                  type="button"
                  onClick={() => handleExport(rok, mesic)}
                  disabled={isExporting}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                    "bg-accent/10 text-accent hover:bg-accent/20",
                    isExporting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Download className="w-3.5 h-3.5" />
                  {isExporting ? "Generuji…" : "Stáhnout XML"}
                </button>
              )}
            </div>

            {/* Warning rows for excluded invoices */}
            {hasWarning && (
              <div className="ml-14 mt-1 space-y-1">
                {euExcluded.map(({ invoice, reason }) => (
                  <div
                    key={invoice.id}
                    className="flex items-center gap-2 text-xs text-warning-text bg-warning-bg border border-warning-border rounded-lg px-3 py-1.5"
                  >
                    <span className="font-medium">{invoice.invoice_number}</span>
                    <span className="text-text-secondary">·</span>
                    <span>{invoice.customer.name}</span>
                    <span className="text-text-secondary">·</span>
                    <span>{invoice.customer.country || "—"}</span>
                    <span className="text-text-secondary">·</span>
                    <span>{EXCLUDE_REASON_LABEL[reason]}</span>
                    <a
                      href={`/invoice/${invoice.id}`}
                      className="ml-auto underline font-medium hover:text-warning-text/80"
                    >
                      Opravit
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
