# Náklady — Fáze 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ruční evidence příchozích faktur (nákladů) — upload PDF, formulář, seznam s filtry, náhled PDF, stav zaplaceno, cashflow karta na dashboardu a export CSV/ZIP pro účetního.

**Architecture:** Nová tabulka `costs` (Supabase, `anon` RLS jako zbytek appky) + privátní Storage bucket `costs` pro PDF. Server actions v `lib/costs.ts`, Zod schémata v `lib/schemas.ts`. UI: stránka `/costs` (server → client list), upload dialog + sdílený formulář, detail/edit stránka `/costs/[id]` s náhledem PDF. PDF se čte přes signed URL generovanou server actionem.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Supabase (`@supabase/ssr`, Storage), Zod v4, shadcn/ui, Sonner, jszip, Biome.

---

## Manuální kroky (uživatel spustí v Supabase — kód je neudělá)

1. **SQL** z Tasku 1 spustit v Supabase SQL editoru (tabulka + politiky).
2. **Storage bucket**: vytvořit privátní bucket `costs` (Dashboard → Storage → New bucket, "Public" vypnuto), pak spustit storage RLS politiky z Tasku 1.

## File Structure

- **Modify** `supabase-schema.sql` — přidat `costs` tabulku, indexy, RLS, storage politiky (dokumentace migrace).
- **Modify** `lib/schemas.ts` — `CostFormDataSchema`, `CostSchema`, typy `CostFormData`, `Cost`.
- **Create** `lib/costs.ts` — server actions (`getCosts`, `getCost`, `createCost`, `updateCost`, `deleteCost`, `setCostPaidAt`, `uploadCostFile`, `getCostFileUrl`, `exportCostsCsv`, `exportCostsZip`) + pure helper `buildCostsCsv`.
- **Create** `app/costs/page.tsx` — seznam (server component).
- **Create** `app/costs/[id]/page.tsx` — detail/edit (server component).
- **Create** `components/costs/CostListClient.tsx` — tabulka + filtry + upload/export tlačítka.
- **Create** `components/costs/CostForm.tsx` — sdílený formulář (create v dialogu i edit na stránce).
- **Create** `components/costs/CostUploadDialog.tsx` — upload PDF + CostForm.
- **Create** `components/costs/CostFilePreview.tsx` — náhled PDF přes signed URL.
- **Modify** `components/ui/Sidebar.tsx` — položka „Náklady".
- **Modify** `app/page.tsx` — cashflow karta (nezaplacené náklady / po splatnosti).

Konvence dle CLAUDE.md: anglické názvy souborů, žádné `any`, stabilní React keys (`item.id`).

---

## Task 1: DB schema + Storage (dokumentace migrace)

**Files:**
- Modify: `supabase-schema.sql` (append na konec)

- [ ] **Step 1: Přidat SQL na konec `supabase-schema.sql`**

```sql
-- ==========================================================================
-- Náklady (příchozí faktury) — Fáze 1
-- ==========================================================================
create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  supplier jsonb not null default '{}',
  invoice_number text not null default '',
  variable_symbol text not null default '',
  currency text not null check (currency in ('CZK','EUR')) default 'CZK',
  issue_date date,
  due_date date,
  received_date date,
  total numeric(12,2) not null default 0,
  vat_amount numeric(12,2),
  reverse_charge boolean not null default false,
  is_eu_supplier boolean not null default false,
  note text not null default '',
  paid_at timestamptz,
  file_path text,
  file_name text,
  source text not null check (source in ('upload','gmail')) default 'upload',
  extraction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costs_created_at_idx on costs (created_at desc);
create index if not exists costs_due_date_idx on costs (due_date);

alter table costs enable row level security;
create policy "anon full access costs" on costs for all to anon using (true) with check (true);

-- Storage bucket `costs` musí být vytvořen ručně (privátní). Politiky pro anon:
create policy "anon read costs files" on storage.objects
  for select to anon using (bucket_id = 'costs');
create policy "anon insert costs files" on storage.objects
  for insert to anon with check (bucket_id = 'costs');
create policy "anon delete costs files" on storage.objects
  for delete to anon using (bucket_id = 'costs');
```

- [ ] **Step 2: Uživatel spustí SQL + vytvoří bucket `costs`**

Ověření: v Supabase Table editoru existuje `costs`; ve Storage existuje privátní bucket `costs`.

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(costs): add costs table + storage schema"
```

---

## Task 2: Zod schémata + typy

**Files:**
- Modify: `lib/schemas.ts`

- [ ] **Step 1: Přidat schémata (za `CustomerRecordFormSchema`, před export typů)**

`CostSupplierSchema` je záměrně volnější než `CustomerSchema` (jméno nemusí být hned známé u Gmail importu, proto `.default("")`).

```typescript
const CostSupplierSchema = z.object({
  name: z.string().default(""),
  ico: z.string().default(""),
  dic: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("CZ"),
})

export const CostFormDataSchema = z.object({
  supplier: CostSupplierSchema,
  invoice_number: z.string().default(""),
  variable_symbol: z.string().default(""),
  currency: CurrencySchema.default("CZK"),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum").or(z.literal("")).default(""),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum").or(z.literal("")).default(""),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum").or(z.literal("")).default(""),
  total: z.number().min(0).default(0),
  vat_amount: z.number().min(0).nullable().default(null),
  reverse_charge: z.boolean().default(false),
  is_eu_supplier: z.boolean().default(false),
  note: z.string().default(""),
  source: z.enum(["upload", "gmail"]).default("upload"),
})

export const CostSchema = CostFormDataSchema.extend({
  id: z.string().uuid(),
  paid_at: z.string().nullable().default(null),
  file_path: z.string().nullable().default(null),
  file_name: z.string().nullable().default(null),
  extraction: z.unknown().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})
```

- [ ] **Step 2: Přidat exporty typů (k ostatním `export type`)**

```typescript
export type CostFormData = z.infer<typeof CostFormDataSchema>
export type Cost = z.infer<typeof CostSchema>
```

- [ ] **Step 3: Ověřit lint/typecheck**

Run: `npx biome lint lib/schemas.ts`
Expected: žádné chyby.

- [ ] **Step 4: Commit**

```bash
git add lib/schemas.ts
git commit -m "feat(costs): add Cost zod schemas and types"
```

---

## Task 3: Server actions — CRUD + paid

**Files:**
- Create: `lib/costs.ts`

- [ ] **Step 1: Vytvořit `lib/costs.ts` s CRUD**

Pole `nullable` v DB (`issue_date` atd.) mapujeme: prázdný string ve formuláři → `null` do DB; z DB `null` → `""` (řeší Zod `.or(z.literal(""))` + normalizace v `rowToCost`).

```typescript
"use server"

import {
  type Cost,
  type CostFormData,
  CostFormDataSchema,
  CostSchema,
  formatZodError,
} from "@/lib/schemas"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const BUCKET = "costs"

// DB ukládá prázdné datum jako NULL; formulář pracuje s "".
function emptyToNull<T>(v: T | ""): T | null {
  return v === "" ? null : (v as T)
}

function toDbRow(form: CostFormData) {
  return {
    supplier: form.supplier,
    invoice_number: form.invoice_number,
    variable_symbol: form.variable_symbol,
    currency: form.currency,
    issue_date: emptyToNull(form.issue_date),
    due_date: emptyToNull(form.due_date),
    received_date: emptyToNull(form.received_date),
    total: form.total,
    vat_amount: form.vat_amount,
    reverse_charge: form.reverse_charge,
    is_eu_supplier: form.is_eu_supplier,
    note: form.note,
    source: form.source,
  }
}

// DB row → Cost (NULL data → "" aby prošla CostSchema).
function rowToCost(row: Record<string, unknown>): Cost | null {
  const normalized = {
    ...row,
    issue_date: row.issue_date ?? "",
    due_date: row.due_date ?? "",
    received_date: row.received_date ?? "",
  }
  const parsed = CostSchema.safeParse(normalized)
  return parsed.success ? parsed.data : null
}

export async function getCosts(): Promise<Cost[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("costs")
    .select("*")
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data.flatMap((row) => {
    const c = rowToCost(row)
    return c ? [c] : []
  })
}

export async function getCost(id: string): Promise<Cost | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("costs").select("*").eq("id", id).single()
  if (error || !data) return null
  return rowToCost(data)
}

export async function createCost(
  form: CostFormData
): Promise<{ data?: Cost; error?: string }> {
  const parsed = CostFormDataSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("costs")
    .insert({ ...toDbRow(parsed.data), created_at: now, updated_at: now })
    .select()
    .single()
  if (error) return { error: error.message }

  const cost = rowToCost(data)
  if (!cost) return { error: "Unexpected response from database" }
  revalidatePath("/costs")
  revalidatePath("/")
  return { data: cost }
}

export async function updateCost(id: string, form: CostFormData): Promise<{ error?: string }> {
  const parsed = CostFormDataSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("costs")
    .update({ ...toDbRow(parsed.data), updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/costs")
  revalidatePath(`/costs/${id}`)
  revalidatePath("/")
  return {}
}

export async function setCostPaidAt(
  id: string,
  paidAt: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("costs")
    .update({ paid_at: paidAt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/costs")
  revalidatePath("/")
  return {}
}

export async function deleteCost(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase.from("costs").select("file_path").eq("id", id).single()
  const { error } = await supabase.from("costs").delete().eq("id", id)
  if (error) return { error: error.message }
  if (existing?.file_path) {
    await supabase.storage.from(BUCKET).remove([existing.file_path])
  }
  revalidatePath("/costs")
  revalidatePath("/")
  return {}
}
```

- [ ] **Step 2: Ověřit lint**

Run: `npx biome lint lib/costs.ts`
Expected: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add lib/costs.ts
git commit -m "feat(costs): add CRUD server actions"
```

---

## Task 4: Server actions — upload PDF + signed URL

**Files:**
- Modify: `lib/costs.ts`

- [ ] **Step 1: Přidat upload/URL akce**

Soubor přichází z klienta jako base64 (stejný vzor jako `sendInvoiceEmail`). Cesta: `{costId}/{file_name}`.

```typescript
export async function uploadCostFile(
  costId: string,
  fileName: string,
  base64: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const path = `${costId}/${fileName}`
  const bytes = Buffer.from(base64, "base64")
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true })
  if (upErr) return { error: upErr.message }

  const { error } = await supabase
    .from("costs")
    .update({ file_path: path, file_name: fileName, updated_at: new Date().toISOString() })
    .eq("id", costId)
  if (error) return { error: error.message }
  revalidatePath("/costs")
  revalidatePath(`/costs/${costId}`)
  return {}
}

export async function getCostFileUrl(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: row } = await supabase.from("costs").select("file_path").eq("id", id).single()
  if (!row?.file_path) return { error: "Soubor není k dispozici" }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, 300)
  if (error || !data) return { error: error?.message ?? "Nepodařilo se vytvořit odkaz" }
  return { url: data.signedUrl }
}
```

- [ ] **Step 2: Ověřit lint**

Run: `npx biome lint lib/costs.ts`
Expected: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add lib/costs.ts
git commit -m "feat(costs): add PDF upload and signed URL actions"
```

---

## Task 5: Export CSV + ZIP pro účetního

**Files:**
- Modify: `lib/costs.ts`

- [ ] **Step 1: Přidat pure helper `buildCostsCsv` + akce**

CSV: středník jako oddělovač (české Excel prostředí), UTF-8 BOM. Filtr období volitelný (`YYYY-MM`), matchuje `issue_date`.

```typescript
import JSZip from "jszip"

const CSV_HEADER = [
  "Dodavatel", "IČ", "DIČ", "Číslo faktury", "VS",
  "Datum vystavení", "Splatnost", "Měna", "Celkem", "DPH", "Zaplaceno",
]

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function buildCostsCsv(costs: Cost[]): string {
  const rows = costs.map((c) =>
    [
      c.supplier.name, c.supplier.ico, c.supplier.dic, c.invoice_number, c.variable_symbol,
      c.issue_date, c.due_date, c.currency, c.total, c.vat_amount ?? "",
      c.paid_at ? "ano" : "ne",
    ]
      .map(csvCell)
      .join(";")
  )
  return `﻿${[CSV_HEADER.map(csvCell).join(";"), ...rows].join("\r\n")}`
}

function inPeriod(cost: Cost, period: string): boolean {
  if (!period) return true
  return cost.issue_date.startsWith(period)
}

export async function exportCostsCsv(
  period = ""
): Promise<{ csv: string; filename: string }> {
  const all = await getCosts()
  const filtered = all.filter((c) => inPeriod(c, period))
  const suffix = period || "vse"
  return { csv: buildCostsCsv(filtered), filename: `naklady-${suffix}.csv` }
}

export async function exportCostsZip(
  period = ""
): Promise<{ base64?: string; filename: string; error?: string }> {
  const supabase = await createClient()
  const all = await getCosts()
  const filtered = all.filter((c) => inPeriod(c, period) && c.file_path)
  const zip = new JSZip()
  for (const c of filtered) {
    if (!c.file_path) continue
    const { data } = await supabase.storage.from(BUCKET).download(c.file_path)
    if (!data) continue
    const buf = Buffer.from(await data.arrayBuffer())
    const name = c.file_name ?? `${c.id}.pdf`
    zip.file(name, buf)
  }
  const base64 = await zip.generateAsync({ type: "base64" })
  const suffix = period || "vse"
  return { base64, filename: `naklady-prilohy-${suffix}.zip` }
}
```

- [ ] **Step 2: Ověřit lint + typecheck**

Run: `npx biome lint lib/costs.ts && npx tsc --noEmit`
Expected: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add lib/costs.ts
git commit -m "feat(costs): add CSV and ZIP export"
```

---

## Task 6: Sdílený formulář `CostForm`

**Files:**
- Create: `components/costs/CostForm.tsx`

- [ ] **Step 1: Vytvořit `CostForm`**

Client komponenta. Props: `initial: CostFormData`, `onSubmit(form): Promise<{error?}>`, `submitLabel`. Pole: dodavatel (name, ico, dic, adresa), invoice_number, variable_symbol, currency (switch/select CZK|EUR), issue_date/due_date/received_date (DatePicker), total, vat_amount, reverse_charge (switch), note (textarea). Použít existující `components/ui` prvky (`input`, `label`, `button`, `switch`, `textarea`, `DatePicker`) a stejný styl jako `CustomerForm.tsx`. Validace přes toast na erroru z `onSubmit`.

Klíčové: čísla parsovat `Number.parseFloat` s fallback 0; prázdné datum = `""`.

- [ ] **Step 2: Ověřit lint**

Run: `npx biome lint components/costs/CostForm.tsx`
Expected: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add components/costs/CostForm.tsx
git commit -m "feat(costs): add shared CostForm component"
```

---

## Task 7: Upload dialog

**Files:**
- Create: `components/costs/CostUploadDialog.tsx`

- [ ] **Step 1: Vytvořit dialog**

Client. Obsahuje `<input type="file" accept="application/pdf">` + `CostForm` (prázdný initial, `received_date` = dnešek). Flow po submitu: `createCost(form)` → pokud je vybraný soubor, přečíst jako base64 (`FileReader.readAsDataURL`, odstranit prefix `data:...;base64,`) → `uploadCostFile(cost.id, file.name, base64)` → toast success → `router.refresh()` + zavřít dialog. Validace: pouze PDF, max ~10 MB (jinak toast error). Použít `components/ui/dialog`.

- [ ] **Step 2: Ověřit lint**

Run: `npx biome lint components/costs/CostUploadDialog.tsx`
Expected: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add components/costs/CostUploadDialog.tsx
git commit -m "feat(costs): add upload dialog"
```

---

## Task 8: Seznam nákladů + filtry + export

**Files:**
- Create: `components/costs/CostListClient.tsx`
- Create: `app/costs/page.tsx`

- [ ] **Step 1: `CostListClient`**

Client. Props: `costs: Cost[]`. Tabulka (`components/ui/table`): Dodavatel, Číslo, Vystaveno, Splatnost, Celkem+měna, Stav (badge zaplaceno/nezaplaceno/po splatnosti — po splatnosti = `!paid_at && due_date < dnes`). Řádek klik → `/costs/${id}`. Nad tabulkou: filtr zaplaceno/nezaplaceno/vše, filtr období (`<input type="month">`), tlačítko „Nahrát fakturu" (otevře `CostUploadDialog`), „Export CSV" a „Export ZIP". Export: zavolat `exportCostsCsv(period)` / `exportCostsZip(period)`, výsledek stáhnout přes Blob + `<a download>` (klientský download, ne server). Součet `total` zobrazit pod tabulkou. Prázdný stav: text „Zatím žádné náklady".

Download helper (CSV):
```typescript
const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
const url = URL.createObjectURL(blob)
const a = document.createElement("a")
a.href = url; a.download = filename; a.click()
URL.revokeObjectURL(url)
```
ZIP: base64 → `Uint8Array` → Blob `application/zip`.

- [ ] **Step 2: `app/costs/page.tsx`**

Server component: `const costs = await getCosts()` → `<CostListClient costs={costs} />`. Nadpis „Náklady".

- [ ] **Step 3: Ověřit lint**

Run: `npx biome lint components/costs/CostListClient.tsx app/costs/page.tsx`
Expected: žádné chyby.

- [ ] **Step 4: Commit**

```bash
git add components/costs/CostListClient.tsx app/costs/page.tsx
git commit -m "feat(costs): add costs list page with filters and export"
```

---

## Task 9: Detail/edit stránka + náhled PDF

**Files:**
- Create: `components/costs/CostFilePreview.tsx`
- Create: `app/costs/[id]/page.tsx`

- [ ] **Step 1: `CostFilePreview`**

Client. Props: `costId`, `hasFile`. Na mount (pokud `hasFile`) zavolá `getCostFileUrl(costId)`, výsledek zobrazí v `<iframe>` (výška ~600px). Loading/chybový stav. Bez souboru: hláška „Bez přílohy".

- [ ] **Step 2: `app/costs/[id]/page.tsx`**

Server component: `const cost = await getCost(id)`; pokud null → `notFound()`. Layout 2 sloupce: vlevo `CostForm` s `initial` z `cost` a `onSubmit` = `updateCost(id, form)`; vpravo `CostFilePreview`. Nahoře toggle zaplaceno (volá `setCostPaidAt`) a tlačítko smazat (`deleteCost` → redirect `/costs`). `CostForm` a akce jsou client; wrapper klient komponenta `CostDetailClient` pokud je potřeba stav.

- [ ] **Step 3: Ověřit lint + typecheck**

Run: `npx biome lint components/costs/CostFilePreview.tsx app/costs/[id]/page.tsx && npx tsc --noEmit`
Expected: žádné chyby.

- [ ] **Step 4: Commit**

```bash
git add components/costs/CostFilePreview.tsx "app/costs/[id]/page.tsx"
git commit -m "feat(costs): add cost detail page with PDF preview"
```

---

## Task 10: Sidebar + dashboard cashflow karta

**Files:**
- Modify: `components/ui/Sidebar.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Sidebar položka**

Do pole odkazů přidat za „Faktury": `{ href: "/costs", label: "Náklady", icon: Receipt }`. Import `Receipt` z `lucide-react`.

- [ ] **Step 2: Dashboard karta**

V `app/page.tsx` (nejdřív si přečíst současnou strukturu dashboard karet a napodobit ji). Načíst `const costs = await getCosts()`. Karta „Náklady": nezaplaceno celkem = `sum(total kde !paid_at)`, po splatnosti = `sum(total kde !paid_at && due_date < dnes)`. Formátovat přes existující `fmtNum` z `lib/invoice`. Měny mohou být smíšené — zobrazit souhrn per měna nebo prostý součet CZK; MVP: seskupit podle `currency`.

- [ ] **Step 3: Ověřit v prohlížeči (browser preview workflow)**

- `preview_start` s `{name: "dev"}` (dle `.claude/launch.json`; pokud chybí, vytvořit: runtimeExecutable `pnpm`, runtimeArgs `["dev"]`, port 3030).
- Projít `/costs`, `read_console_messages` a `preview_logs` na chyby.
- Nahrát testovací PDF, ověřit vytvoření + náhled + export CSV.
- Screenshot na závěr.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Sidebar.tsx app/page.tsx
git commit -m "feat(costs): add sidebar link and dashboard cashflow card"
```

---

## Self-Review (proti specu)

- **Evidence + archiv**: `costs` tabulka + Storage PDF + list + detail ✓ (Tasky 1–4, 8, 9)
- **Cashflow**: dashboard karta nezaplaceno / po splatnosti ✓ (Task 10)
- **Podklady pro účetního**: CSV + ZIP export za období ✓ (Task 5, 8)
- **Ruční upload**: upload dialog + base64 → Storage ✓ (Task 4, 7)
- **Náhled PDF**: signed URL + iframe ✓ (Task 9)
- **Stav zaplaceno**: `setCostPaidAt` + badge ✓ (Task 3, 8, 9)
- **Fáze 2–4 mimo rozsah** tohoto plánu (Gmail, DPH/EU, AI) — pole v modelu připravena (`source`, `vat_amount`, `reverse_charge`, `is_eu_supplier`, `extraction`).

Typová konzistence: `CostFormData`/`Cost` použity jednotně; akce `getCosts/getCost/createCost/updateCost/deleteCost/setCostPaidAt/uploadCostFile/getCostFileUrl/exportCostsCsv/exportCostsZip/buildCostsCsv` mají stabilní názvy napříč tasky.
