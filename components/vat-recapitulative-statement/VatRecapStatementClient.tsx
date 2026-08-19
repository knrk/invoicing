"use client"

import { useState } from "react"
import { exportVatRecapStatementXml } from "@/lib/actions"
import { toast } from "sonner"
import type { VatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import type { ReceivedObligationData } from "@/lib/vat-obligation-overview"
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

/** České skloňování počtu dokladů. */
function docWord(n: number): string {
  if (n === 1) return "doklad"
  if (n >= 2 && n <= 4) return "doklady"
  return "dokladů"
}

/** Příznak, který u přijaté faktury zakládá povinnost. */
function costFlag(c: ReceivedObligationData["costs"][number]): string {
  if (c.is_eu_supplier && c.reverse_charge) return "EU · PDP"
  if (c.is_eu_supplier) return "EU"
  return "PDP"
}

/** Součet přijaté strany per měna — tržby a náklady se nikdy nesčítají. */
function receivedAmount(d: ReceivedObligationData): string {
  const parts: string[] = []
  if (d.totalCzk > 0) parts.push(`${d.totalCzk.toLocaleString("cs-CZ")} Kč`)
  if (d.totalEur > 0) parts.push(`${d.totalEur.toLocaleString("cs-CZ")} €`)
  return parts.join(" / ") || "—"
}

interface MonthEntry {
  rok: number
  mesic: number
  data: VatRecapStatementData | null
  received: ReceivedObligationData
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
      {months.map(({ rok, mesic, data, received, error }) => {
        const key = `${rok}-${mesic}`
        const isExporting = exporting === key

        // Vydaná strana (souhrnné hlášení + XML)
        const outgoingNeeded = data !== null && data.rows.length > 0
        const totalCzk = data?.rows.reduce((s, r) => s + r.pln_hodnota, 0) ?? 0
        const invoiceCount = data?.invoices.length ?? 0
        const euExcluded = data?.excluded.filter((e) => e.reason !== "not_eur_currency") ?? []
        const hasWarning = euExcluded.length > 0

        // Přijatá strana (pořízení z EU / přenesená DP)
        const receivedNeeded = received.costs.length > 0

        const obligation = outgoingNeeded || receivedNeeded

        return (
          <div key={key} className="flex flex-col gap-0">
            <div
              className={cn(
                "flex items-center gap-4 px-5 py-4 rounded-xl border transition-colors",
                error || obligation || hasWarning
                  ? "bg-surface border-border"
                  : "bg-subtle border-transparent"
              )}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {error ? (
                  <AlertCircle className="w-5 h-5 text-danger" />
                ) : obligation ? (
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                ) : hasWarning ? (
                  <TriangleAlert className="w-5 h-5 text-warning-text" />
                ) : (
                  <Circle className="w-5 h-5 text-text-secondary" />
                )}
              </div>

              {/* Month label */}
              <div className="w-36 shrink-0">
                <span className="text-sm font-semibold text-text">
                  {CZ_MONTHS[mesic]} {rok}
                </span>
              </div>

              {/* Status text — dvě částky odděleně */}
              <div className="flex-1 text-sm text-text-secondary">
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : obligation ? (
                  <div className="space-y-0.5">
                    {outgoingNeeded && (
                      <div>
                        Vydané: <span className="font-medium text-text">{invoiceCount}</span>{" "}
                        {docWord(invoiceCount)} ·{" "}
                        <span className="font-medium text-text">
                          {totalCzk.toLocaleString("cs-CZ")} Kč
                        </span>
                        {hasWarning && (
                          <span className="ml-2 text-warning-text">
                            · {euExcluded.length} vyloučeno
                          </span>
                        )}
                      </div>
                    )}
                    {receivedNeeded && (
                      <div>
                        Přijaté:{" "}
                        <span className="font-medium text-text">{received.costs.length}</span>{" "}
                        {docWord(received.costs.length)} ·{" "}
                        <span className="font-medium text-text">{receivedAmount(received)}</span>
                      </div>
                    )}
                  </div>
                ) : hasWarning ? (
                  <span className="text-warning-text">
                    {euExcluded.length}{" "}
                    {euExcluded.length === 1 ? "faktura vyloučena" : "faktury vyloučeny"} — zkontrolujte níže
                  </span>
                ) : (
                  <span>Bez povinnosti hlášení</span>
                )}
              </div>

              {/* Export button — jen vydaná strana */}
              {outgoingNeeded && !error && (
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

            {/* Detail přijatých faktur (pořízení z EU / přenesená DP) */}
            {receivedNeeded && (
              <div className="ml-14 mt-1 space-y-1">
                {received.costs.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 text-xs text-text-secondary bg-subtle border border-border rounded-lg px-3 py-1.5"
                  >
                    <span className="font-medium text-text">{c.invoice_number || "—"}</span>
                    <span>·</span>
                    <span>{c.supplier_name || "—"}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {c.total.toLocaleString("cs-CZ")} {c.currency === "EUR" ? "€" : "Kč"}
                    </span>
                    <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
                      {costFlag(c)}
                    </span>
                    <a
                      href={`/costs/${c.id}`}
                      className="ml-auto underline font-medium hover:text-text"
                    >
                      Detail
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Warning rows for excluded outgoing invoices */}
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
