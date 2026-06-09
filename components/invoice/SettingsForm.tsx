"use client"

import { useState } from "react"
import type { AppConfig } from "@/types"
import { saveConfig } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const DEFAULT_CONFIG: Omit<AppConfig, "id" | "updated_at"> = {
  supplier: {
    name: "",
    ico: "",
    street: "",
    zip: "",
    city: "",
    phone: "",
    email: "",
    web1: "",
    web2: "",
  },
  banking: {
    account_czk: "",
    account_eur_iban: "",
    account_eur_bic: "",
    constant_symbol: "0308",
  },
  invoice: {
    prefix_czk: "FV",
    prefix_eur: "IN",
    last_sequence: 0,
    default_due_days_czk: 7,
    default_due_days_eur: 14,
  },
  footer: {
    penalty_cs:
      "Při zpožděné úhradě Vám budeme účtovat penále ve výši 0,05% za každý započatý den prodlení.\n\nNejsem plátce DPH.",
    penalty_en:
      "In case of late payment, we will charge a penalty of 0.05% for each commenced day of delay.",
    note_cs: "Fyzická osoba zapsaná v Živnostenském rejstříku od 1.9.2004\nEvidenční číslo ŽL: 381006-4173-00",
    note_en: "",
  },
}

export default function SettingsForm({ config }: { config: AppConfig | null }) {
  const [form, setForm] = useState(() => {
    if (!config) return DEFAULT_CONFIG
    const { id: _id, updated_at: _u, ...rest } = config
    return rest
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function setNested<S extends keyof typeof form>(
    section: S,
    key: keyof (typeof form)[S],
    value: string | number
  ) {
    setForm((f) => ({
      ...f,
      [section]: { ...f[section], [key]: value },
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const result = await saveConfig(form)
    setSaving(false)
    if (result.error) {
      setSaveError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dodavatel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Jméno / Název">
              <Input value={form.supplier.name} onChange={(e) => setNested("supplier", "name", e.target.value)} />
            </Field>
            <Field label="IČ">
              <Input value={form.supplier.ico} onChange={(e) => setNested("supplier", "ico", e.target.value)} />
            </Field>
            <Field label="Ulice">
              <Input value={form.supplier.street} onChange={(e) => setNested("supplier", "street", e.target.value)} />
            </Field>
            <Field label="PSČ">
              <Input value={form.supplier.zip} onChange={(e) => setNested("supplier", "zip", e.target.value)} />
            </Field>
            <Field label="Město">
              <Input value={form.supplier.city} onChange={(e) => setNested("supplier", "city", e.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={form.supplier.phone} onChange={(e) => setNested("supplier", "phone", e.target.value)} />
            </Field>
            <Field label="E-mail">
              <Input value={form.supplier.email} onChange={(e) => setNested("supplier", "email", e.target.value)} />
            </Field>
            <Field label="Web 1">
              <Input value={form.supplier.web1} onChange={(e) => setNested("supplier", "web1", e.target.value)} />
            </Field>
            <Field label="Web 2 (volitelný)">
              <Input value={form.supplier.web2} onChange={(e) => setNested("supplier", "web2", e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bankovní údaje</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Účet CZK — IBAN" hint="Nutné pro QR platbu. Formát: CZ6508000000192000145399">
              <Input
                value={form.banking.account_czk}
                onChange={(e) => setNested("banking", "account_czk", e.target.value)}
                placeholder="CZ65 0800 0000 1920 0014 5399"
                mono
              />
            </Field>
            <Field label="IBAN (EUR)">
              <Input
                value={form.banking.account_eur_iban}
                onChange={(e) => setNested("banking", "account_eur_iban", e.target.value)}
                placeholder="CZ00 0000 0000 0000 0000 0000"
                mono
              />
            </Field>
            <Field label="BIC / SWIFT (EUR)">
              <Input
                value={form.banking.account_eur_bic}
                onChange={(e) => setNested("banking", "account_eur_bic", e.target.value)}
                placeholder="XXXXCZPP"
                mono
              />
            </Field>
            <Field label="Konstantní symbol">
              <Input
                value={form.banking.constant_symbol}
                onChange={(e) => setNested("banking", "constant_symbol", e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Číslování faktur</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prefix CZ faktur">
              <Input
                value={form.invoice.prefix_czk}
                onChange={(e) => setNested("invoice", "prefix_czk", e.target.value)}
                mono
              />
            </Field>
            <Field label="Prefix EN faktur">
              <Input
                value={form.invoice.prefix_eur}
                onChange={(e) => setNested("invoice", "prefix_eur", e.target.value)}
                mono
              />
            </Field>
            <Field label="Poslední pořadové číslo">
              <Input
                type="number"
                value={String(form.invoice.last_sequence)}
                onChange={(e) => setNested("invoice", "last_sequence", parseInt(e.target.value) || 0)}
              />
            </Field>
            <Field label="Splatnost CZK (dny)">
              <Input
                type="number"
                value={String(form.invoice.default_due_days_czk)}
                onChange={(e) => setNested("invoice", "default_due_days_czk", parseInt(e.target.value) || 7)}
              />
            </Field>
            <Field label="Splatnost EUR (dny)">
              <Input
                type="number"
                value={String(form.invoice.default_due_days_eur)}
                onChange={(e) => setNested("invoice", "default_due_days_eur", parseInt(e.target.value) || 14)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Texty v patičce</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Field label="Penále (CZ)">
              <Textarea
                value={form.footer.penalty_cs}
                onChange={(e) => setNested("footer", "penalty_cs", e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Penále (EN)">
              <Textarea
                value={form.footer.penalty_en}
                onChange={(e) => setNested("footer", "penalty_en", e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Poznámka (CZ)">
              <Textarea
                value={form.footer.note_cs}
                onChange={(e) => setNested("footer", "note_cs", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Poznámka (EN)">
              <Textarea
                value={form.footer.note_en}
                onChange={(e) => setNested("footer", "note_en", e.target.value)}
                rows={2}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Ukládám..." : "Uložit nastavení"}
        </Button>
        {saved && (
          <span className="text-sm text-green-700 font-medium">✓ Uloženo</span>
        )}
        {saveError && (
          <Alert variant="destructive" className="flex-1 py-2">
            <AlertDescription>Chyba: {saveError}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
