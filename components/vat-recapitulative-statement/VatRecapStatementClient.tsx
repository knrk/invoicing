"use client"

import { useState } from "react"
import { exportVatRecapStatementXml } from "@/lib/actions"
import { toast } from "sonner"
import type { VatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import type { ReceivedObligationData } from "@/lib/vat-obligation-overview"
import { formatSentDate, monthKey, type VatReportSend } from "@/lib/vat-report-sends"
import type { AppConfig } from "@/types"
import { AlertCircle, CircleCheck, Download, Send, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import SendToAccountantDialog, { type MonthTarget } from "./SendToAccountantDialog"

const CZ_MONTHS = [
  "", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]

const CZ_MONTH_ABBR = [
  "", "LED", "ÚNO", "BŘE", "DUB", "KVĚ", "ČVN",
  "ČVC", "SRP", "ZÁŘ", "ŘÍJ", "LIS", "PRO",
]

const EXCLUDE_REASON_LABEL: Record<string, string> = {
  missing_vat: "chybí DIČ odběratele",
  not_eu: "odběratel není z EU",
  not_eur_currency: "faktura není v EUR",
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
  config: AppConfig | null
  sends: VatReportSend[]
}

interface Cell {
  label: string
  value: string
}

/** Kalendářní dlaždice měsíce; barva pruhu odpovídá stavu. */
function MonthTile({
  rok,
  mesic,
  tone,
}: { rok: number; mesic: number; tone: "ready" | "sent" | "issue" | "none" }) {
  return (
    <div
      role="img"
      aria-label={`${CZ_MONTHS[mesic]} ${rok}`}
      className={cn(
        "flex h-14 w-[52px] shrink-0 flex-col overflow-hidden rounded-[12px]",
        tone === "none"
          ? "border-[1.5px] border-dashed border-[light-dark(#b9b8b2,#3a443e)]"
          : "border border-[light-dark(#cfcec8,#3a443e)] bg-surface"
      )}
    >
      <div
        className={cn(
          "flex h-5 items-center justify-center text-[10px] font-bold tracking-[0.08em]",
          tone === "ready" && "bg-accent text-primary-foreground",
          tone === "sent" && "bg-[light-dark(#e9ecec,#2a322d)] text-[light-dark(#2f3d39,#caded2)]",
          tone === "issue" && "bg-[light-dark(#f5e9c8,#3a3118)] text-[light-dark(#6e5210,#e6cf9a)]",
          tone === "none" && "bg-[light-dark(#e3e3df,#2a322d)] text-text-secondary"
        )}
      >
        {CZ_MONTH_ABBR[mesic]}
      </div>
      <div
        className={cn(
          "flex flex-1 items-center justify-center text-[22px] font-bold leading-none tabular-nums",
          tone === "none" ? "text-text-secondary" : "text-text"
        )}
      >
        {String(mesic).padStart(2, "0")}
      </div>
    </div>
  )
}

/** Stavová ikona, z poloviny vyčnívající přes levý okraj karty. */
function StatusBadge({ kind, label }: { kind: "sent" | "issue"; label: string }) {
  return (
    <span className="absolute -left-[11px] top-1/2 flex -translate-y-1/2">
      {kind === "sent" ? (
        <CircleCheck
          role="img"
          aria-label={label}
          className="size-5 fill-accent text-primary-foreground"
        >
          <title>{label}</title>
        </CircleCheck>
      ) : (
        <TriangleAlert
          role="img"
          aria-label={label}
          className="size-5 fill-warning-text text-primary-foreground"
        >
          <title>{label}</title>
        </TriangleAlert>
      )}
    </span>
  )
}

/**
 * Sub-karty pod hlavní kartou — první vyjíždí zpod rodiče, napojené stromovou
 * čarou. Každý řádek je jedna položka (vyloučená / přijatá faktura).
 */
function SubItems({ children }: { children: React.ReactElement[] }) {
  const count = children.length
  return (
    <div className="relative z-0 -mt-[30px] ml-10 flex flex-col gap-1.5 pl-7">
      {children.map((child, i) => {
        const first = i === 0
        const last = i === count - 1
        return (
          <div key={child.key} className="relative flex">
            {/* větvení: koleno do řádku */}
            <div
              aria-hidden="true"
              className={cn(
                "absolute left-[-28px] box-border w-7 rounded-bl-[14px] border-b-2 border-l-2 border-border",
                first ? "top-6 h-[calc(50%-12px)]" : "-top-1.5 h-[calc(50%+6px)]"
              )}
            />
            {/* pokračování svislé čáry k dalšímu řádku */}
            {!last && (
              <div
                aria-hidden="true"
                className={cn(
                  "absolute left-[-28px] w-0.5 bg-border",
                  first ? "top-[calc(50%+12px)] -bottom-1.5" : "top-1/2 -bottom-1.5"
                )}
              />
            )}
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 bg-[light-dark(#e3e7e5,#222a26)] pb-2.5 pl-[41px] pr-6 text-sm text-text",
                first ? "rounded-b-[16px] pt-[34px]" : "rounded-[16px] pt-2.5"
              )}
            >
              {child}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function VatRecapStatementClient({ months, configMissing, config, sends }: Props) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [sentMap, setSentMap] = useState<Record<string, VatReportSend>>(() =>
    Object.fromEntries(sends.map((s) => [monthKey(s.rok, s.mesic), s]))
  )
  const [dialogTarget, setDialogTarget] = useState<MonthTarget | null>(null)
  const { year } = useYearFilter()
  const visibleMonths = months.filter((m) => m.rok === year)

  if (configMissing || !config) {
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
    const key = monthKey(rok, mesic)
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

  function handleSent(send: VatReportSend) {
    setSentMap((prev) => ({ ...prev, [monthKey(send.rok, send.mesic)]: send }))
  }

  if (visibleMonths.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-secondary shadow-card">
        Žádné měsíce s povinností hlášení v roce {year}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {visibleMonths.map(({ rok, mesic, data, received, error }) => {
          const key = monthKey(rok, mesic)
          const isExporting = exporting === key
          const send = sentMap[key]

          // Vydaná strana (souhrnné hlášení + XML)
          const outgoingNeeded = data !== null && data.rows.length > 0
          const totalCzk = data?.rows.reduce((s, r) => s + r.pln_hodnota, 0) ?? 0
          const invoiceCount = data?.invoices.length ?? 0
          const euExcluded = data?.excluded.filter((e) => e.reason !== "not_eur_currency") ?? []
          const hasWarning = euExcluded.length > 0

          // Přijatá strana (pořízení z EU / přenesená DP)
          const receivedNeeded = received.costs.length > 0

          const obligation = outgoingNeeded || receivedNeeded
          const isSent = outgoingNeeded && !!send
          const showCard = !!error || obligation || hasWarning

          const tone = isSent ? "sent" : hasWarning ? "issue" : obligation ? "ready" : "none"

          if (!showCard) {
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-5 rounded-3xl bg-subtle py-3.5 pl-3.5 pr-6"
              >
                <MonthTile rok={rok} mesic={mesic} tone="none" />
                <p className="flex-1 text-[15px] text-text-secondary">
                  Tento měsíc bez povinnosti podat souhrnné hlášení
                </p>
              </div>
            )
          }

          const cells: Cell[] = []
          if (outgoingNeeded) {
            cells.push({ label: "Zahrnuto", value: String(invoiceCount) })
            cells.push({ label: "Celkem", value: `${totalCzk.toLocaleString("cs-CZ")} Kč` })
          }
          if (hasWarning) {
            cells.push({ label: "Vyloučeno", value: String(euExcluded.length) })
          }
          if (receivedNeeded) {
            cells.push({
              label: "Přijaté",
              value: `${received.costs.length} · ${receivedAmount(received)}`,
            })
          }

          return (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="relative z-10 flex flex-wrap items-center gap-5 rounded-3xl border border-border bg-surface py-3.5 pl-3.5 pr-6">
                {isSent && send && (
                  <StatusBadge
                    kind="sent"
                    label={`Odesláno ${formatSentDate(send.sent_at)} · ${send.sent_to}`}
                  />
                )}
                {!isSent && hasWarning && <StatusBadge kind="issue" label="Vyžaduje kontrolu" />}

                <MonthTile rok={rok} mesic={mesic} tone={tone} />

                <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-stretch">
                  {error ? (
                    <span className="flex items-center gap-2 px-5 text-sm text-danger">
                      <AlertCircle className="size-4" aria-hidden="true" />
                      {error}
                    </span>
                  ) : (
                    cells.map((c, i) => (
                      <div
                        key={c.label}
                        className={cn(
                          "flex flex-col gap-0.5 px-5 py-0.5",
                          i > 0 && "border-l border-divider"
                        )}
                      >
                        <span className="text-xs font-medium text-text-secondary">{c.label}</span>
                        <span className="text-base font-semibold tabular-nums text-text">
                          {c.value}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {outgoingNeeded && !error && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant="secondary"
                      className="px-3.5 text-[13px]"
                      onClick={() => handleExport(rok, mesic)}
                      disabled={isExporting}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      {isExporting ? "Generuji…" : "Stáhnout XML"}
                    </Button>
                    {!isSent && (
                      <Button
                        variant="dark"
                        className="px-3.5 text-[13px]"
                        onClick={() => setDialogTarget({ rok, mesic, invoices: data?.invoices ?? [] })}
                        aria-label={`Odeslat účetní ${CZ_MONTHS[mesic]} ${rok}`}
                      >
                        <Send className="size-4" aria-hidden="true" />
                        Odeslat účetní
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-karty: vyloučené vydané faktury, pak detail přijatých */}
              {(hasWarning || receivedNeeded) && (
                <SubItems>
                  {[
                    ...euExcluded.map(({ invoice, reason }) => (
                      <div key={`ex-${invoice.id}`} className="contents">
                        <a
                          href={`/invoice/${invoice.id}`}
                          className="font-semibold underline hover:text-text-secondary"
                        >
                          {invoice.invoice_number}
                        </a>
                        <span aria-hidden="true">·</span>
                        <span>{invoice.customer.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{invoice.customer.country || "—"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[13px] text-text-secondary">
                          {EXCLUDE_REASON_LABEL[reason]}
                        </span>
                        <a
                          href={`/invoice/${invoice.id}`}
                          className="ml-auto font-semibold underline hover:text-text-secondary"
                        >
                          Opravit
                        </a>
                      </div>
                    )),
                    ...received.costs.map((c) => (
                      <div key={`rc-${c.id}`} className="contents">
                        <a
                          href={`/costs/${c.id}`}
                          className="font-semibold underline hover:text-text-secondary"
                        >
                          {c.invoice_number || "—"}
                        </a>
                        <span aria-hidden="true">·</span>
                        <span>{c.supplier_name || "—"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {c.total.toLocaleString("cs-CZ")} {c.currency === "EUR" ? "€" : "Kč"}
                        </span>
                        <span className="ml-auto text-[13px] text-text-secondary">
                          {costFlag(c)}
                        </span>
                      </div>
                    )),
                  ]}
                </SubItems>
              )}
            </div>
          )
        })}
      </div>

      <SendToAccountantDialog
        target={dialogTarget}
        config={config}
        onClose={() => setDialogTarget(null)}
        onSent={handleSent}
      />
    </div>
  )
}
