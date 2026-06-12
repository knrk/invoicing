"use client"

import { useState } from "react"
import type { CustomerRecord, CustomerRecordForm } from "@/types"
import { createCustomer, updateCustomer } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface Props {
  existing?: CustomerRecord
  onDone: () => void
}

function emptyForm(): CustomerRecordForm {
  return {
    name: "",
    ico: "",
    dic: "",
    street: "",
    zip: "",
    city: "",
    country: "CZ",
    language: "cs",
    currency: "CZK",
    payment_method: "Převodem",
  }
}

export default function CustomerForm({ existing, onDone }: Props) {
  const [form, setForm] = useState<CustomerRecordForm>(
    existing
      ? {
          name: existing.name,
          ico: existing.ico,
          dic: existing.dic,
          street: existing.street,
          zip: existing.zip,
          city: existing.city,
          country: existing.country,
          language: existing.language,
          currency: existing.currency,
          payment_method: existing.payment_method,
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof CustomerRecordForm>(key: K, value: CustomerRecordForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const isCz = form.language === "cs"

  function setLanguage(en: boolean) {
    setForm((f) => ({
      ...f,
      language: en ? "en" : "cs",
      currency: en ? "EUR" : "CZK",
      payment_method: en ? "Bank transfer" : "Převodem",
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = existing
      ? await updateCustomer(existing.id, form)
      : await createCustomer(form)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      onDone()
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="warning">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Language toggle */}
      <div className="flex items-center justify-between">
        <Label>Typ odběratele</Label>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", !isCz && "text-muted-foreground")}>CZ</span>
          <Switch size="sm" checked={!isCz} onCheckedChange={setLanguage} />
          <span className={cn("text-sm font-medium", isCz && "text-muted-foreground")}>EN</span>
        </div>
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="cf-name">{isCz ? "Název" : "Company name"}</Label>
        <Input
          id="cf-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={isCz ? "Název společnosti" : "Company name"}
        />
      </div>

      {/* IČ / DIČ */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cf-ico">{isCz ? "IČ" : "Reg. No."}</Label>
          <Input id="cf-ico" value={form.ico} onChange={(e) => set("ico", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cf-dic">{isCz ? "DIČ" : "VAT ID"}</Label>
          <Input id="cf-dic" value={form.dic} onChange={(e) => set("dic", e.target.value)} />
        </div>
      </div>

      {/* Address */}
      <div>
        <Label htmlFor="cf-street">{isCz ? "Ulice" : "Street"}</Label>
        <Input id="cf-street" value={form.street} onChange={(e) => set("street", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cf-zip">PSČ</Label>
          <Input id="cf-zip" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cf-city">{isCz ? "Město" : "City"}</Label>
          <Input id="cf-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
      </div>
      {!isCz && (
        <div>
          <Label htmlFor="cf-country">Country</Label>
          <Input
            id="cf-country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
            placeholder="SK, DE, AT…"
          />
        </div>
      )}

      {/* Payment method */}
      <div>
        <Label htmlFor="cf-payment">{isCz ? "Způsob platby" : "Payment method"}</Label>
        <Input
          id="cf-payment"
          value={form.payment_method}
          onChange={(e) => set("payment_method", e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>Zrušit</Button>
        <Button variant="dark" onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : existing ? "Uložit změny" : "Přidat odběratele"}
        </Button>
      </div>
    </div>
  )
}
