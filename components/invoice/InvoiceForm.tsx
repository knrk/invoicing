"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { AppConfig, Invoice, InvoiceFormData, InvoiceLine, Language, CustomerRecord } from "@/types"
import {
  getCurrency,
  getDueDays,
  generateId,
  today,
  addDays,
  LABELS,
  fmtNum,
} from "@/lib/invoice"
import { createInvoice, updateInvoice, getNextInvoiceSequence } from "@/lib/actions"
import { exportToPDF } from "@/lib/pdf"
import InvoicePreview from "./InvoicePreview"
import DatePicker from "@/components/ui/DatePicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface Props {
  config: AppConfig
  existing?: Invoice
  customers?: CustomerRecord[]
}

function emptyLine(): InvoiceLine {
  return { id: generateId(), description: "", sub_description: "", is_advance: false, quantity: 1, unit: "h", unit_price: 0, total: 0 }
}

function initForm(config: AppConfig, existing?: Invoice): InvoiceFormData {
  if (existing) return { ...existing }

  const lang: Language = "cs"
  const year = new Date().getFullYear()
  const invoiceNumber = `${year}01`
  const t = today()

  return {
    invoice_number: invoiceNumber,
    language: lang,
    currency: getCurrency(lang),
    issue_date: t,
    due_date: addDays(t, getDueDays(lang, config)),
    payment_method: "Převodem",
    variable_symbol: invoiceNumber,
    reverse_charge: false,
    customer: { name: "", ico: "", dic: "", street: "", zip: "", city: "", country: "CZ" },
    lines: [emptyLine()],
    total: 0,
  }
}

function displayCurrency(c: string): string {
  return c === "CZK" ? "Kč" : c
}

export default function InvoiceForm({ config, existing, customers = [] }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<InvoiceFormData>(() => initForm(config, existing))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState(false)
  const [editPaymentMethod, setEditPaymentMethod] = useState(false)
  const [editVariableSymbol, setEditVariableSymbol] = useState(false)

  const total = useMemo(() => form.lines.reduce((s, l) => s + l.total, 0), [form.lines])
  const formWithTotal = useMemo(() => ({ ...form, total }), [form, total])

  useEffect(() => {
    if (existing) return
    const year = new Date().getFullYear()
    getNextInvoiceSequence().then((seq) => {
      const num = `${year}${String(seq).padStart(2, "0")}`
      setForm((f) => ({
        ...f,
        invoice_number: num,
        variable_symbol: num,
      }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setField<K extends keyof InvoiceFormData>(key: K, value: InvoiceFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setCustomerField(key: keyof InvoiceFormData["customer"], value: string) {
    setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }))
  }

  async function setLanguage(lang: Language) {
    const currency = getCurrency(lang)
    const dueDays = getDueDays(lang, config)
    const year = new Date().getFullYear()

    let invoiceNumber = form.invoice_number
    if (!existing) {
      const seq = await getNextInvoiceSequence()
      invoiceNumber = `${year}${String(seq).padStart(2, "0")}`
    }

    setForm((f) => ({
      ...f,
      language: lang,
      currency,
      payment_method: lang === "cs" ? "Převodem" : "Bank transfer",
      invoice_number: invoiceNumber,
      due_date: addDays(f.issue_date, dueDays),
    }))
  }

  const updateLine = useCallback((id: string, key: keyof InvoiceLine, value: string | number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [key]: value }
        const sign = updated.is_advance ? -1 : 1
        updated.total = sign * updated.quantity * updated.unit_price
        return updated
      }),
    }))
  }, [])

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  }

  function removeLine(id: string) {
    setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) {
        const result = await updateInvoice(existing.id, formWithTotal)
        if (result.error) setSaveError(result.error)
        else router.refresh()
      } else {
        const result = await createInvoice(formWithTotal)
        if (result.error) setSaveError(result.error)
        else if (result.data) router.push(`/invoice/${result.data.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      await exportToPDF(formWithTotal, config)
    } finally {
      setExporting(false)
    }
  }

  function applyCustomer(c: CustomerRecord) {
    setForm((f) => ({
      ...f,
      language: c.language,
      currency: c.currency,
      payment_method: c.payment_method || (c.language === "cs" ? "Převodem" : "Bank transfer"),
      customer: {
        name: c.name,
        ico: c.ico,
        dic: c.dic,
        street: c.street,
        zip: c.zip,
        city: c.city,
        country: c.country,
      },
    }))
  }

  const isCz = form.language === "cs"
  const L = {
    ...LABELS.cs.form,
    save: existing ? LABELS.cs.form.save : LABELS.cs.form.saveNew,
  }

  return (
    <div className="flex h-screen overflow-hidden">

      <div className="w-[38%] flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="px-6 pt-6 pb-4 space-y-6 flex-1 overflow-y-auto">

          {saveError && (
            <Alert variant="warning">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}

          {customers.length > 0 && (
            <CustomerPicker
              customers={customers}
              onSelect={applyCustomer}
            />
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-text">{L.detailsSection}</h2>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", !isCz && "text-text-secondary")}>CZ</span>
                <Switch
                  size="sm"
                  checked={!isCz}
                  onCheckedChange={(checked) => setLanguage(checked ? "en" : "cs")}
                />
                <span className={cn("text-sm font-medium", isCz && "text-text-secondary")}>EN</span>
              </div>
            </div>
            <div className="space-y-4">

              <Field label={L.customerSection} htmlFor="f-customer-name">
                <Input
                  id="f-customer-name"
                  value={form.customer.name}
                  onChange={(e) => setCustomerField("name", e.target.value)}
                  placeholder={L.customerName}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L.ico} htmlFor="f-customer-ico">
                  <Input id="f-customer-ico" value={form.customer.ico} onChange={(e) => setCustomerField("ico", e.target.value)} />
                </Field>
                <Field label={L.dic} htmlFor="f-customer-dic">
                  <Input id="f-customer-dic" value={form.customer.dic} onChange={(e) => setCustomerField("dic", e.target.value)} />
                </Field>
              </div>

              <Field label="Adresa" htmlFor="f-customer-street">
                <Input
                  id="f-customer-street"
                  value={form.customer.street}
                  onChange={(e) => setCustomerField("street", e.target.value)}
                  placeholder="Ulice a číslo popisné"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L.zip} htmlFor="f-customer-zip">
                  <Input id="f-customer-zip" value={form.customer.zip} onChange={(e) => setCustomerField("zip", e.target.value)} />
                </Field>
                <Field label={L.city} htmlFor="f-customer-city">
                  <Input id="f-customer-city" value={form.customer.city} onChange={(e) => setCustomerField("city", e.target.value)} />
                </Field>
              </div>
              {!isCz && (
                <Field label={L.country} htmlFor="f-customer-country">
                  <Input
                    id="f-customer-country"
                    value={form.customer.country}
                    onChange={(e) => setCustomerField("country", e.target.value)}
                    placeholder="SK, DE, AT..."
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label={L.invoiceNumber} htmlFor="f-invoice-number">
                  {editInvoiceNumber ? (
                    <Input
                      id="f-invoice-number"
                      autoFocus
                      value={form.invoice_number}
                      onChange={(e) => setField("invoice_number", e.target.value)}
                      onBlur={() => setEditInvoiceNumber(false)}
                      mono
                    />
                  ) : (
                    <ReadonlyField value={form.invoice_number} onEdit={() => setEditInvoiceNumber(true)} mono />
                  )}
                </Field>
                <Field label={L.payment} htmlFor="f-payment-method">
                  {editPaymentMethod ? (
                    <Input
                      id="f-payment-method"
                      autoFocus
                      value={form.payment_method}
                      onChange={(e) => setField("payment_method", e.target.value)}
                      onBlur={() => setEditPaymentMethod(false)}
                    />
                  ) : (
                    <ReadonlyField value={form.payment_method} onEdit={() => setEditPaymentMethod(true)} />
                  )}
                </Field>
              </div>

              {isCz && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Variabilní symbol" htmlFor="f-variable-symbol">
                    {editVariableSymbol ? (
                      <Input
                        id="f-variable-symbol"
                        autoFocus
                        value={form.variable_symbol}
                        onChange={(e) => setField("variable_symbol", e.target.value)}
                        onBlur={() => setEditVariableSymbol(false)}
                        mono
                      />
                    ) : (
                      <ReadonlyField value={form.variable_symbol} onEdit={() => setEditVariableSymbol(true)} mono />
                    )}
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label={L.issueDate}>
                  <DatePicker value={form.issue_date} language={form.language} onChange={(v) => setField("issue_date", v)} />
                </Field>
                <Field label={L.dueDate}>
                  <DatePicker value={form.due_date} language={form.language} onChange={(v) => setField("due_date", v)} />
                </Field>
              </div>

              {!isCz && (
                <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-text">{L.reverseCharge}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Art. 196 Council Directive 2006/112/EC</p>
                  </div>
                  <Switch
                    size="sm"
                    checked={form.reverse_charge}
                    onCheckedChange={(checked) => setField("reverse_charge", checked)}
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-[16px] font-bold text-text mb-4">{L.linesSection}</h2>

            <div className="space-y-3">
              {form.lines.map((line, idx) => (
                <div key={line.id} className="rounded-xl bg-subtle border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-text-secondary">#{String(idx + 1).padStart(2, "0")}</span>
                    {form.lines.length > 1 && (
                      <button
                        onClick={() => removeLine(line.id)}
                        className="p-1 text-text-secondary hover:text-danger transition-colors rounded"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <div>
                      <Label className="mb-1.5 block text-xs">Popis</Label>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder={L.descPlaceholder}
                        onKeyDown={(e) => { if (e.key === "Enter" && idx === form.lines.length - 1) addLine() }}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Doplňkový popis</Label>
                      <Input
                        value={line.sub_description ?? ""}
                        onChange={(e) => updateLine(line.id, "sub_description", e.target.value)}
                        placeholder="Volitelný doplňkový popis…"
                        className="bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="mb-1.5 block text-xs">{L.qty}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, "quantity", parseFloat(e.target.value) || 0)}
                          className="bg-white"
                        />
                      </div>
                      <div>
                        <Label className="mb-1.5 block text-xs">Jedn.</Label>
                        <Input
                          value={line.unit}
                          onChange={(e) => updateLine(line.id, "unit", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                      <div>
                        <Label className="mb-1.5 block text-xs">{L.unitPrice}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={line.unit_price}
                          onChange={(e) => updateLine(line.id, "unit_price", parseFloat(e.target.value) || 0)}
                          className="bg-white"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          size="sm"
                          checked={line.is_advance}
                          onCheckedChange={(v) => updateLine(line.id, "is_advance", v)}
                        />
                        <span className="text-xs text-text-secondary">Záloha</span>
                      </div>
                      <div className="text-xs text-text-secondary">
                        {L.total}:{" "}
                        <span className={line.is_advance ? "font-semibold text-danger" : "font-semibold text-text"}>
                          {line.is_advance ? "−" : ""}{fmtNum(Math.abs(line.total))} {displayCurrency(form.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addLine}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-orange-600 transition-colors"
            >
              <span className="text-base leading-none">+</span> {L.addLine}
            </button>

            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-sm font-semibold text-text">{L.total}</span>
              <span className="text-[20px] font-bold text-text tabular-nums">
                {fmtNum(total)} {displayCurrency(form.currency)}
              </span>
            </div>
          </section>

        </div>

        <div className="border-t border-border bg-surface px-6 py-4 flex items-center justify-between flex-shrink-0">
          <Button variant="link" asChild>
            <Link href="/">{L.cancel}</Link>
          </Button>
          <Button variant="dark" onClick={handleSave} disabled={saving}>
            {saving ? "..." : L.save}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-page overflow-hidden">
        <div className="flex items-center justify-between px-8 py-4 bg-surface border-b border-border">
          <span className="text-[15px] font-semibold text-text">Náhled</span>
          <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
            {exporting ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            )}
            {exporting ? "Exportuji..." : L.exportPDF}
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-8">
          <div className="shadow-lg rounded overflow-hidden" style={{ width: "794px", margin: "0 auto" }}>
            <InvoicePreview invoice={formWithTotal} config={config} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function ReadonlyField({ value, onEdit, mono }: { value: string; onEdit: () => void; mono?: boolean }) {
  return (
    <div className="group flex items-center gap-2 px-3 py-2.5 rounded-lg bg-subtle border border-transparent">
      <span className={cn("flex-1 text-sm text-text", mono && "font-mono")}>{value || "—"}</span>
      <button
        onClick={onEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-text-secondary hover:text-text rounded"
        title="Upravit"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  )
}

function CustomerPicker({
  customers,
  onSelect,
}: {
  customers: CustomerRecord[]
  onSelect: (c: CustomerRecord) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  return (
    <section ref={ref} className="relative">
      <Label className="mb-1.5 block">Odběratel</Label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2",
          "h-10 px-3 rounded-md border text-sm bg-background",
          "transition-colors",
          open
            ? "border-ring ring-2 ring-ring/30 text-foreground"
            : "border-input text-text-secondary hover:border-ring/60 hover:text-foreground",
        )}
      >
        <span>Vybrat odběratele…</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-background border border-border rounded-lg shadow-lg overflow-hidden py-1">
          {customers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onSelect(c); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-text hover:bg-subtle transition-colors flex items-center gap-2"
            >
              <span className="flex-1 truncate font-medium">{c.name}</span>
              <span className="shrink-0 text-xs text-text-secondary uppercase tracking-wide">
                {c.language === "cs" ? "CZ" : "EN"}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
