"use client"

import { AresLookupButton } from "@/components/invoice/AresLookupButton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAresLookup } from "@/hooks/use-ares-lookup"
import { createSupplier, updateSupplier } from "@/lib/suppliers"
import { cn } from "@/lib/utils"
import type { SupplierRecord, SupplierRecordForm } from "@/types"
import { useState } from "react"
import { toast } from "sonner"

interface Props {
  existing?: SupplierRecord
  onDone: () => void
}

function emptyForm(): SupplierRecordForm {
  return {
    name: "",
    ico: "",
    dic: "",
    street: "",
    zip: "",
    city: "",
    country: "CZ",
    phone: "",
    email: "",
    note: "",
  }
}

export default function SupplierForm({ existing, onDone }: Props) {
  const [form, setForm] = useState<SupplierRecordForm>(
    existing
      ? {
          name: existing.name,
          ico: existing.ico,
          dic: existing.dic,
          street: existing.street,
          zip: existing.zip,
          city: existing.city,
          country: existing.country,
          phone: existing.phone ?? "",
          email: existing.email ?? "",
          note: existing.note ?? "",
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const { aresLoading, lookupAres } = useAresLookup((message) =>
    toast.error("Vyhledání v ARESu selhalo", { description: message })
  )

  function set<K extends keyof SupplierRecordForm>(key: K, value: SupplierRecordForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

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

  const showAresLookup = form.ico.trim() !== ""

  async function handleSave() {
    setSaving(true)
    const result = existing ? await updateSupplier(existing.id, form) : await createSupplier(form)
    setSaving(false)
    if (result.error) {
      toast.error("Chyba při ukládání", { description: result.error })
    } else {
      toast.success(existing ? "Dodavatel uložen" : "Dodavatel přidán")
      onDone()
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="sf-name">Název</Label>
        <Input
          id="sf-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Název společnosti"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sf-ico">IČ</Label>
          <div className="relative">
            <Input
              id="sf-ico"
              value={form.ico}
              onChange={(e) => set("ico", e.target.value)}
              className={cn(showAresLookup && "pr-9")}
            />
            {showAresLookup && <AresLookupButton onLookup={handleAresLookup} loading={aresLoading} />}
          </div>
        </div>
        <div>
          <Label htmlFor="sf-dic">DIČ</Label>
          <Input id="sf-dic" value={form.dic} onChange={(e) => set("dic", e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="sf-street">Ulice</Label>
        <Input id="sf-street" value={form.street} onChange={(e) => set("street", e.target.value)} />
      </div>
      <div className="grid grid-cols-[100px_1fr_100px] gap-3">
        <div>
          <Label htmlFor="sf-zip">PSČ</Label>
          <Input id="sf-zip" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sf-city">Město</Label>
          <Input id="sf-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sf-country">Země</Label>
          <Input
            id="sf-country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sf-phone">Telefon (nepovinné)</Label>
          <Input
            id="sf-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+420 …"
          />
        </div>
        <div>
          <Label htmlFor="sf-email">E-mail</Label>
          <Input
            id="sf-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="fakturace@dodavatel.cz"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="sf-note">Poznámka</Label>
        <Textarea
          id="sf-note"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button variant="dark" onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám…" : existing ? "Uložit změny" : "Přidat dodavatele"}
        </Button>
      </div>
    </div>
  )
}
