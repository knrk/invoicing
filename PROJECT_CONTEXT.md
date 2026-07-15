# Invoicing App — Project Context

> Tento soubor slouží jako kontext pro nové Claude sessions. Přečti ho na začátku každé nové konverzace k tomuto projektu.

---

## Tech Stack

- **Next.js 16** (App Router, server components, server actions `"use server"`)
- **React 19**, **TypeScript**, **Tailwind CSS v4** (`@theme inline`, `light-dark()` CSS function)
- **Supabase** (PostgreSQL + RLS, server-side client, JSONB sloupce)
- **Zod** pro validaci schémat
- **shadcn/ui** komponenty
- **Sonner v2.0.7** pro toast notifikace
- **Biome** jako linter (bez formatteru)
- **pnpm** jako package manager

---

## Struktura projektu

```
app/
  layout.tsx                         — RootLayout, <Toaster> (sonner, bottom-right)
  page.tsx                           — Seznam faktur (server component)
  invoice/
    new/page.tsx                     — Nová faktura
    [id]/page.tsx                    — Editace faktury
  customers/page.tsx                 — Odběratelé
  settings/page.tsx                  — Nastavení
  vat-recapitulative-statement/
    page.tsx                         — Souhrnné hlášení
  api/ares/[ico]/route.ts            — ARES proxy API

components/
  ui/
    Sidebar.tsx                      — Navigace (FileText, BadgeEuro, Contact, Settings ikony)
    sonner.tsx                       — shadcn Toaster wrapper
    button, input, label, card,
    dialog, table, badge, switch,
    calendar, textarea, DatePicker
  invoice/
    InvoiceForm.tsx                  — Formulář faktury (client)
    InvoicePreview.tsx               — Náhled faktury (render)
    InvoiceListClient.tsx            — Seznam faktur (client)
    CustomerForm.tsx                 — Formulář odběratele (client)
    CustomerListClient.tsx           — Grid odběratelů (client)
    SettingsForm.tsx                 — Nastavení (client)
  vat-recapitulative-statement/
    VatRecapStatementClient.tsx      — Souhrnné hlášení UI (client)

lib/
  actions.ts                         — Všechny server actions
  schemas.ts                         — Zod schémata + typy
  invoice.ts                         — Helpers (fmtNum, addDays, today, LABELS, …)
  pdf.ts                             — PDF export (html2canvas / html2pdf)
  InvoicePDF.tsx                     — HTML šablona pro PDF
  cnb.ts                             — CNB exchange rate API
  vat-recapitulative-statement.ts    — Souhrnné hlášení: logika + XML generování
  qr.ts                              — QR kód pro platbu
  supabase/server.ts                 — Supabase server client
  utils.ts                           — cn(), …

types/index.ts                       — Re-exportuje typy z lib/schemas.ts
supabase-schema.sql                  — Kompletní DB schema + migrace
```

---

## Databáze (Supabase)

### Tabulka `config` (jeden záznam, id=1)
```sql
id integer primary key default 1
supplier jsonb   -- SupplierConfig
banking  jsonb   -- BankingConfig
invoice  jsonb   -- InvoiceConfig (default_due_days_czk, default_due_days_eur)
footer   jsonb   -- FooterConfig (penalty_cs/en, note_cs/en)
tax      jsonb   -- TaxConfig (c_ufo, c_pracufo, typ_ds, prijmeni, jmeno, sest_telef)
updated_at timestamptz
```

### Tabulka `invoices`
```
id uuid, invoice_number text, language cs|en, currency CZK|EUR
issue_date date, due_date date, payment_method text, variable_symbol text
reverse_charge boolean, customer jsonb, lines jsonb, total numeric
paid_at timestamptz nullable, created_at/updated_at timestamptz
```

### Tabulka `customers`
```
id uuid, name, ico, dic, street, zip, city, country (default CZ)
language cs|en, currency CZK|EUR, payment_method, email
created_at/updated_at timestamptz
```

**RLS**: anon má full access (single-user local app). Před veřejným deploymentem přejít na auth.uid()-based politiky.

---

## Klíčové typy (`lib/schemas.ts`)

```typescript
AppConfig {
  supplier: { name, ico, dic, street, zip, city, phone, email, web1, web2 }
  banking:  { account_czk, account_eur_iban, account_eur_bic, constant_symbol }
  invoice:  { default_due_days_czk, default_due_days_eur }
  footer:   { penalty_cs, penalty_en, note_cs, note_en }
  tax:      { c_ufo, c_pracufo, typ_ds, prijmeni, jmeno, sest_telef }
}

Invoice extends InvoiceFormData {
  id: string (uuid), created_at, updated_at, paid_at: string | null
}

InvoiceFormData {
  invoice_number, language, currency, issue_date, due_date
  payment_method, variable_symbol, reverse_charge: boolean
  customer: { name, ico, dic, street, zip, city, country }
  lines: InvoiceLine[], total: number
}

InvoiceLine {
  id, description, sub_description, is_advance: boolean
  quantity, unit, unit_price, total
}

CustomerRecord { id, name, ico, dic, street, zip, city, country, email, language, currency, payment_method }
```

---

## Server Actions (`lib/actions.ts`)

| Akce | Popis |
|------|-------|
| `getConfig()` | Načte AppConfig (id=1) |
| `saveConfig(config)` | Upsert konfigurace |
| `getInvoices()` | Všechny faktury, order by created_at desc |
| `getInvoice(id)` | Jedna faktura |
| `createInvoice(formData)` | Vytvoří fakturu, vrátí nový objekt |
| `updateInvoice(id, formData)` | Aktualizuje fakturu |
| `deleteInvoice(id)` | Smaže fakturu |
| `duplicateInvoice(id)` | Zkopíruje fakturu s novým číslem a dnešním datem |
| `setInvoicePaidAt(id, paidAt)` | Nastaví datum zaplacení (null = zruší) |
| `getNextInvoiceSequence()` | Vrátí další pořadové číslo faktury pro aktuální rok |
| `getCustomers()` | Všichni odběratelé, order by name |
| `createCustomer(form)` | Vytvoří odběratele |
| `updateCustomer(id, form)` | Aktualizuje odběratele |
| `deleteCustomer(id)` | Smaže odběratele |
| `getVatRecapStatementData(rok, mesic)` | Data souhrnného hlášení |
| `exportVatRecapStatementXml(rok, mesic)` | Vygeneruje XML + filename |

---

## Souhrnné hlášení (VAT Recapitulative Statement)

### Co to je
Česká EC Sales List — identifikovaná osoba podává za každý měsíc, ve kterém poskytla plnění osobám registrovaným k DPH v jiném členském státě EU. Pouze EUR faktury, pouze EU odběratelé (bez CZ).

### Soubory
- `lib/vat-recapitulative-statement.ts` — veškerá logika
- `lib/cnb.ts` — kurzy ČNB
- `app/vat-recapitulative-statement/page.tsx` — stránka
- `components/vat-recapitulative-statement/VatRecapStatementClient.tsx` — UI

### Logika filtrování
1. Faktura musí mít `currency === "EUR"`
2. `customer.dic` (VAT ID) nesmí být prázdné
3. Země se detekuje z **prefixu VAT ID** (primární): první 2 znaky musí být v `EU_MEMBER_STATES`
4. Fallback: `customer.country` musí být v `EU_MEMBER_STATES`
5. CZ je záměrně vyloučeno z množiny EU_MEMBER_STATES

EU_MEMBER_STATES: AT, BE, BG, CY, DE, DK, EE, ES, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK

### CNB API
```
https://api.cnb.cz/cnbapi/exrates/daily?date=YYYY-MM-DD&lang=EN
```
Kurzy se cachují v Next.js (revalidate: 86400s). Rate cache v `buildVatRecapStatementData` zabrání duplicitním callům pro stejné datum.

### Zobrazení měsíců
Stránka zobrazuje **pouze měsíce pro které existuje alespoň jedna faktura** (z `issue_date`). Aktuální měsíc je vždy vyloučen — hlášení se podává za dokončené měsíce.

### XML struktura (DPHSHV)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Pisemnost nazevSW="Fakturace" verzeSW="1.0">
<DPHSHV verzePis="02.01">
  <VetaD k_uladis="DPH" dokument="SHV" rok="..." shvies_forma="R" d_poddp="DD.MM.YYYY" mesic="..." />
  <VetaP c_ufo="..." c_pracufo="..." dic="..." typ_ds="F" prijmeni="..." jmeno="..."
         naz_obce="..." ulice="..." c_pop="..." psc="..."
         sest_prijmeni="..." sest_jmeno="..." sest_telef="..." />
  <VetaR por_c_stran="1" c_rad="1" k_stat="FR" c_vat="36818371742"
         k_pln_eu="3" pln_pocet="2" pln_hodnota="85000" />
</DPHSHV>
<Kontrola>
  <Soubor Delka="..." KC="md5hash" Nazev="DPHSHV-dic-datum-cas" c_ufo="..." />
</Kontrola>
</Pisemnost>
```

**Důležité detaily XML:**
- `dic` v VetaP = bez `CZ` prefixu
- `c_vat` = VAT ID bez 2-letterového country prefixu, bez mezer (`.replace(/\s/g, "")`)
- `ulice` + `c_pop` = parsováno z `supplier.street` regexem `/^(.+?)\s+(\d+[a-zA-Z]?)(?:\/\d+[a-zA-Z]?)?$/` — číslo orientační (`/2`) se ignoruje
- `pln_hodnota` = CZK, zaokrouhleno na celé Kč (`Math.round(total * eurRate)`)
- MD5 checksum se počítá **pouze z DPHSHV bloku** (ne z celého XML)
- `Delka` = byte length UTF-8 DPHSHV bloku

### Filename formát
`DPHSHV-{dic_bez_CZ}-{YYYYMMDD}-{HHmmss}.xml`

---

## Toast notifikace (Sonner)

`<Toaster richColors position="bottom-right" />` je v `app/layout.tsx`.

Ve všech client komponentech se používá:
```typescript
import { toast } from "sonner"
toast.success("...")
toast.error("Název chyby", { description: detail })
```

Komponenty kde jsou toasty:
- `SettingsForm.tsx` — save success/error
- `InvoiceForm.tsx` — save error (create + update)
- `CustomerForm.tsx` — save success/error
- `InvoiceListClient.tsx` — delete error, duplicate error
- `CustomerListClient.tsx` — delete error
- `VatRecapStatementClient.tsx` — export error, export success

**Sonner byl nainstalován manuálně** (`npm pack` + ruční rozbalení do node_modules) kvůli npm arborist bug při `npm install`.

---

## Číslování faktur

Formát: `{rok}{pořadové_číslo_padded_2}` — např. `202601`, `202602`, …

`getNextInvoiceSequence()` / `nextSeq()` hledá nejvyšší existující číslo pro aktuální rok a vrátí +1. Žádný databázový sequence — jen MAX + 1.

---

## Sidebar navigace

```typescript
{ href: "/",                             label: "Faktury",           icon: FileText  }
{ href: "/vat-recapitulative-statement", label: "Souhrnné hlášení",  icon: BadgeEuro }
{ href: "/customers",                    label: "Odběratelé",        icon: Contact   }
{ href: "/settings",                     label: "Nastavení",         icon: Settings  }
```

---

## Coding Rules (z CLAUDE.md)

1. **File naming**: vždy anglicky (`invoice-list.tsx`, `tax-config.ts`). Nikdy česky.
2. **TypeScript**: žádné `any`. Použij `unknown`, explicitní interface, nebo narrowest možný cast.
3. **React Keys**: nikdy index pole jako key. Vždy stabilní identifikátor z dat (`item.id`).

---

## Věci které NEděláme

- **Zustand**: zbytečný, stav je čistě lokální per-komponent + server→props data flow
- `c_or` (číslo orientační): pole neexistuje ve VetaP, ignorujeme část za `/` v adrese

---

## Otevřené / možné budoucí úkoly

- Supabase RLS přechod na auth.uid()-based politiky před veřejným deploymentem
- Paid invoices filter / archív
- Emailing faktur přímo z app (customer.email je uložen)
- Podpora více měn v souhrnném hlášení (aktuálně pouze EUR)
