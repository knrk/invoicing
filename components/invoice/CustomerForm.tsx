"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createCustomer, updateCustomer } from "@/lib/actions"
import { useAresLookup } from "@/hooks/use-ares-lookup"
import { cn } from "@/lib/utils"
import type { CustomerRecord, CustomerRecordForm } from "@/types"
import { useState } from "react"
import { toast } from "sonner"
import { AresLookupButton } from "./AresLookupButton"

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
    email: "",
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
          email: existing.email ?? "",
          language: existing.language,
          currency: existing.currency,
          payment_method: existing.payment_method,
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const { aresLoading, lookupAres } = useAresLookup((message) =>
    toast.error("Vyhledání v ARESu selhalo", { description: message })
  )

  async function handleAresLookup() {
    const data = await lookupAres(form.ico)
    if (!data) return
    setForm((f) => ({
      ...f,
      name: data.obchodniJmeno || f.name,
      dic: data.dic || f.dic,
      street: data.street || f.street,
      zip: data.zip || f.zip,
      city: data.city || f.city,
    }))
  }

  function set<K extends keyof CustomerRecordForm>(key: K, value: CustomerRecordForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const isCz = form.language === "cs"
  const showAresLookup = isCz && form.ico.trim() !== "" && form.street.trim() === ""

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
    const result = existing ? await updateCustomer(existing.id, form) : await createCustomer(form)
    setSaving(false)
    if (result.error) {
      toast.error("Chyba při ukládání", { description: result.error })
    } else {
      toast.success(existing ? "Odběratel uložen" : "Odběratel přidán")
      onDone()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Typ odběratele</Label>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", !isCz && "text-muted-foreground")}>CZ</span>
          <Switch size="sm" checked={!isCz} onCheckedChange={setLanguage} />
          <span className={cn("text-sm font-medium", isCz && "text-muted-foreground")}>EN</span>
        </div>
      </div>

      <div>
        <Label htmlFor="cf-name">Název</Label>
        <Input
          id="cf-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Název společnosti"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cf-ico">IČ</Label>
          <div className="relative">
            <Input
              id="cf-ico"
              value={form.ico}
              onChange={(e) => set("ico", e.target.value)}
              className={cn(showAresLookup && "pr-9")}
            />
            {showAresLookup && (
              <AresLookupButton onLookup={handleAresLookup} loading={aresLoading} />
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="cf-dic">DIČ</Label>
          <Input id="cf-dic" value={form.dic} onChange={(e) => set("dic", e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="cf-street">Ulice</Label>
        <Input id="cf-street" value={form.street} onChange={(e) => set("street", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cf-zip">PSČ</Label>
          <Input id="cf-zip" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cf-city">Město</Label>
          <Input id="cf-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
      </div>
      {!isCz && (
        <div>
          <Label htmlFor="cf-country">Země</Label>
          <Input
            id="cf-country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
            placeholder="SK, DE, AT…"
          />
        </div>
      )}

      <div>
        <Label htmlFor="cf-payment">Způsob platby</Label>
        <Input
          id="cf-payment"
          value={form.payment_method}
          onChange={(e) => set("payment_method", e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="cf-email">E-mail pro zasílání faktur</Label>
        <Input
          id="cf-email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="fakturace@firma.cz"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button variant="dark" onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : existing ? "Uložit změny" : "Přidat odběratele"}
        </Button>
      </div>
    </div>
  )
}
