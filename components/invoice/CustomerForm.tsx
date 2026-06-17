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
  const [error, setError] = useState<string | null>(null)
  const [aresLoading, setAresLoading] = useState(false)
  const [aresError, setAresError] = useState<string | null>(null)

  async function handleAresLookup() {
    const ico = form.ico.trim()
    if (!ico) return
    setAresLoading(true)
    setAresError(null)
    try {
      const res = await fetch(`/api/ares/${ico}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setAresError(body.error ?? `ARES ${res.status}`)
        return
      }

      const json = await res.json()

      setForm((f) => ({
        ...f,
        name: json.obchodniJmeno || f.name,
        dic: json.dic || f.dic,
        street: json.street || f.street,
        zip: json.zip || f.zip,
        city: json.city || f.city,
      }))
    } catch {
      setAresError("Nepodařilo se spojit s ARESem")
    } finally {
      setAresLoading(false)
    }
  }

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
          <Input id="cf-ico" value={form.ico} onChange={(e) => set("ico", e.target.value)} />
          {isCz && (
            <>
              <button
                type="button"
                onClick={handleAresLookup}
                disabled={aresLoading || !form.ico}
                className="mt-1 text-xs text-primary underline underline-offset-2 hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aresLoading ? "Načítám…" : "Vyhledat v ARESu"}
              </button>
              {aresError && <p className="mt-1 text-xs text-danger">{aresError}</p>}
            </>
          )}
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
        <Button variant="outline" onClick={onDone}>Zrušit</Button>
        <Button variant="dark" onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : existing ? "Uložit změny" : "Přidat odběratele"}
        </Button>
      </div>
    </div>
  )
}
