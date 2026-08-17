"use client"

import { AresLookupButton } from "@/components/invoice/AresLookupButton"
import DatePicker from "@/components/ui/DatePicker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAresLookup } from "@/hooks/use-ares-lookup"
import { getSuppliers } from "@/lib/suppliers"
import { cn } from "@/lib/utils"
import type { CostFormData, SupplierRecord } from "@/types"
import { useEffect, useState } from "react"
import { toast } from "sonner"

interface Props {
  value: CostFormData
  onChange: (value: CostFormData) => void
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

// Povolí jen číslice a desetinnou čárku, max 2 desetinná místa. Poslední
// oddělovač (`,` nebo `.`) je desetinný; vše před ním jsou tisíce (zahodí se).
function sanitizeAmount(raw: string): string {
  const s = raw.replace(/[^\d.,]/g, "")
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."))
  if (lastSep === -1) return s
  const intPart = s.slice(0, lastSep).replace(/[.,]/g, "")
  const dec = s
    .slice(lastSep + 1)
    .replace(/[.,]/g, "")
    .slice(0, 2)
  return `${intPart},${dec}`
}

export default function CostForm({ value, onChange }: Props) {
  const [savedSuppliers, setSavedSuppliers] = useState<SupplierRecord[]>([])
  const [totalText, setTotalText] = useState(() =>
    value.total ? String(value.total).replace(".", ",") : ""
  )
  const { aresLoading, lookupAres } = useAresLookup((message) =>
    toast.error("Vyhledání v ARESu selhalo", { description: message })
  )

  useEffect(() => {
    getSuppliers().then(setSavedSuppliers)
  }, [])

  function pickSupplier(id: string) {
    const s = savedSuppliers.find((x) => x.id === id)
    if (!s) return
    onChange({
      ...value,
      supplier: {
        name: s.name,
        ico: s.ico,
        dic: s.dic,
        street: s.street,
        zip: s.zip,
        city: s.city,
        country: s.country,
      },
    })
  }

  function set<K extends keyof CostFormData>(key: K, v: CostFormData[K]) {
    onChange({ ...value, [key]: v })
  }

  function setSupplier<K extends keyof CostFormData["supplier"]>(
    key: K,
    v: CostFormData["supplier"][K]
  ) {
    onChange({ ...value, supplier: { ...value.supplier, [key]: v } })
  }

  async function handleAresLookup() {
    const data = await lookupAres(value.supplier.ico)
    if (!data) return
    onChange({
      ...value,
      supplier: {
        ...value.supplier,
        name: data.obchodniJmeno || value.supplier.name,
        dic: data.dic || value.supplier.dic,
        street: data.street || value.supplier.street,
        zip: data.zip || value.supplier.zip,
        city: data.city || value.supplier.city,
      },
    })
  }

  // Na poli IČ je ARES lookup vždy, když je IČ vyplněné — ať jde kdykoli
  // (i po vyplnění názvu) údaje přenačíst.
  const showAresLookup = value.supplier.ico.trim() !== ""
  const isEur = value.currency === "EUR"

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

      {savedSuppliers.length > 0 && (
        <div>
          <Label htmlFor="cost-supplier-pick">Vybrat z uložených dodavatelů</Label>
          <Select value="" onValueChange={pickSupplier}>
            <SelectTrigger id="cost-supplier-pick" className="w-full">
              <SelectValue placeholder="— vyber dodavatele —" />
            </SelectTrigger>
            <SelectContent>
              {savedSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.ico ? ` (IČ ${s.ico})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="cost-supplier-name">Dodavatel</Label>
        <Input
          id="cost-supplier-name"
          value={value.supplier.name}
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
              value={value.supplier.ico}
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
            value={value.supplier.dic}
            onChange={(e) => setSupplier("dic", e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="cost-supplier-street">Ulice</Label>
        <Input
          id="cost-supplier-street"
          value={value.supplier.street}
          onChange={(e) => setSupplier("street", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="cost-supplier-zip">PSČ</Label>
          <Input
            id="cost-supplier-zip"
            value={value.supplier.zip}
            onChange={(e) => setSupplier("zip", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-supplier-city">Město</Label>
          <Input
            id="cost-supplier-city"
            value={value.supplier.city}
            onChange={(e) => setSupplier("city", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-supplier-country">Země</Label>
          <Input
            id="cost-supplier-country"
            value={value.supplier.country}
            onChange={(e) => setSupplier("country", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cost-invoice-number">Číslo faktury</Label>
          <Input
            id="cost-invoice-number"
            value={value.invoice_number}
            onChange={(e) => set("invoice_number", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cost-vs">Variabilní symbol</Label>
          <Input
            id="cost-vs"
            value={value.variable_symbol}
            onChange={(e) => set("variable_symbol", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Datum vystavení</Label>
          <DatePicker
            value={value.issue_date}
            language="cs"
            onChange={(v) => set("issue_date", v)}
          />
        </div>
        <div>
          <Label>Splatnost</Label>
          <DatePicker value={value.due_date} language="cs" onChange={(v) => set("due_date", v)} />
        </div>
        <div>
          <Label>Přijato</Label>
          <DatePicker
            value={value.received_date}
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
          value={totalText}
          onChange={(e) => {
            const s = sanitizeAmount(e.target.value)
            setTotalText(s)
            set("total", parseNumber(s))
          }}
        />
      </div>

      <div>
        <Label htmlFor="cost-note">Poznámka</Label>
        <Textarea
          id="cost-note"
          value={value.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
        />
      </div>
    </div>
  )
}
