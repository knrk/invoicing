"use client"

import { AresLookupButton } from "@/components/invoice/AresLookupButton"
import { Button } from "@/components/ui/button"
import DatePicker from "@/components/ui/DatePicker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAresLookup } from "@/hooks/use-ares-lookup"
import { cn } from "@/lib/utils"
import type { CostFormData } from "@/types"
import { useState } from "react"
import { toast } from "sonner"

interface Props {
  initial: CostFormData
  submitLabel: string
  onSubmit: (form: CostFormData) => Promise<{ error?: string }>
  onCancel?: () => void
}

export function emptyCostForm(): CostFormData {
  return {
    supplier: { name: "", ico: "", dic: "", street: "", zip: "", city: "", country: "CZ" },
    invoice_number: "",
    variable_symbol: "",
    currency: "CZK",
    issue_date: "",
    due_date: "",
    received_date: "",
    total: 0,
    vat_amount: null,
    reverse_charge: false,
    is_eu_supplier: false,
    note: "",
    source: "upload",
  }
}

function parseNumber(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."))
  return Number.isNaN(n) ? 0 : n
}

export default function CostForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<CostFormData>(initial)
  const [saving, setSaving] = useState(false)
  const { aresLoading, lookupAres } = useAresLookup((message) =>
    toast.error("Vyhledání v ARESu selhalo", { description: message })
  )

  function set<K extends keyof CostFormData>(key: K, value: CostFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setSupplier<K extends keyof CostFormData["supplier"]>(
    key: K,
    value: CostFormData["supplier"][K]
  ) {
    setForm((f) => ({ ...f, supplier: { ...f.supplier, [key]: value } }))
  }

  async function handleAresLookup() {
    const data = await lookupAres(form.supplier.ico)
    if (!data) return
    setForm((f) => ({
      ...f,
      supplier: {
        ...f.supplier,
        name: data.obchodniJmeno || f.supplier.name,
        dic: data.dic || f.supplier.dic,
        street: data.street || f.supplier.street,
        zip: data.zip || f.supplier.zip,
        city: data.city || f.supplier.city,
      },
    }))
  }

  const showAresLookup = form.supplier.ico.trim() !== "" && form.supplier.name.trim() === ""

  async function handleSubmit() {
    setSaving(true)
    const result = await onSubmit(form)
    setSaving(false)
    if (result.error) {
      toast.error("Chyba při ukládání", { description: result.error })
    }
  }

  const isEur = form.currency === "EUR"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Měna</Label>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", isEur && "text-muted-foreground")}>CZK</span>
          <Switch
            size="sm"
            checked={isEur}
            onCheckedChange={(eur) => set("currency", eur ? "EUR" : "CZK")}
          />
          <span className={cn("text-sm font-medium", !isEur && "text-muted-foreground")}>EUR</span>
        </div>
      </div>

      <div>
        <Label htmlFor="cost-supplier-name">Dodavatel</Label>
        <Input
          id="cost-supplier-name"
          value={form.supplier.name}
          onChange={(e) => setSupplier("name", e.target.value)}
          placeholder="Název dodavatele"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cost-supplier-ico">IČ</Label>
          <div className="relative">
            <Input
              id="cost-supplier-ico"
              value={form.supplier.ico}
              onChange={(e) => setSupplier("ico", e.target.value)}
              className={cn(showAresLookup && "pr-9")}
            />
            {showAresLookup && (
              <AresLookupButton onLookup={handleAresLookup} loading={aresLoading} />
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="cost-supplier-dic">DIČ</Label>
          <Input
            id="cost-supplier-dic"
            value={form.supplier.dic}
            onChange={(e) => setSupplier("dic", e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="cost-supplier-street">Ulice</Label>
        <Input
          id="cost-supplier-street"
          value={form.supplier.street}
          onChange={(e) => setSupplier("street", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="cost-supplier-zip">PSČ</Label>
          <Input
            id="cost-supplier-zip"
            value={form.supplier.zip}
            onChange={(e) => setSupplier("zip", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-supplier-city">Město</Label>
          <Input
            id="cost-supplier-city"
            value={form.supplier.city}
            onChange={(e) => setSupplier("city", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-supplier-country">Země</Label>
          <Input
            id="cost-supplier-country"
            value={form.supplier.country}
            onChange={(e) => setSupplier("country", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cost-invoice-number">Číslo faktury</Label>
          <Input
            id="cost-invoice-number"
            value={form.invoice_number}
            onChange={(e) => set("invoice_number", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-vs">Variabilní symbol</Label>
          <Input
            id="cost-vs"
            value={form.variable_symbol}
            onChange={(e) => set("variable_symbol", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Datum vystavení</Label>
          <DatePicker
            value={form.issue_date}
            language="cs"
            onChange={(v) => set("issue_date", v)}
          />
        </div>
        <div>
          <Label>Splatnost</Label>
          <DatePicker value={form.due_date} language="cs" onChange={(v) => set("due_date", v)} />
        </div>
        <div>
          <Label>Přijato</Label>
          <DatePicker
            value={form.received_date}
            language="cs"
            onChange={(v) => set("received_date", v)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="cost-total">Celkem ({isEur ? "€" : "Kč"})</Label>
        <Input
          id="cost-total"
          inputMode="decimal"
          value={String(form.total)}
          onChange={(e) => set("total", parseNumber(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="cost-note">Poznámka</Label>
        <Textarea
          id="cost-note"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Zrušit
          </Button>
        )}
        <Button variant="dark" onClick={handleSubmit} disabled={saving}>
          {saving ? "Ukládám…" : submitLabel}
        </Button>
      </div>
    </div>
  )
}
