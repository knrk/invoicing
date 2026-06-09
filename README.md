# Fakturace

Jednoduchá fakturační aplikace – Next.js 16 + Supabase.

## Setup

### 1. Supabase
1. Vytvoř projekt na [supabase.com](https://supabase.com)
2. Otevři **SQL Editor** a spusť obsah souboru `supabase-schema.sql`
3. Zkopíruj `.env.local.example` → `.env.local` a doplň URL a anon key z **Settings → API**

### 2. Instalace a spuštění
```bash
npm install
npm run dev
```
Otevři http://localhost:3000, pak přejdi na /settings a vyplň údaje dodavatele.

## Struktura projektu
```
app/
  page.tsx                    # Přehled faktur
  invoice/new/page.tsx        # Nová faktura
  invoice/[id]/page.tsx       # Detail / editace
  settings/page.tsx           # Konfigurace dodavatele
components/
  invoice/
    InvoiceForm.tsx           # Formulář + live preview
    InvoicePreview.tsx        # A4 náhled (základ PDF)
    InvoiceListClient.tsx     # Tabulka faktur
    SettingsForm.tsx          # Nastavení dodavatele
  ui/
    Nav.tsx
    InlineDatePicker.tsx
lib/
  actions.ts                  # Server Actions (Supabase)
  invoice.ts                  # Helpers, překlady (CZ/EN)
  qr.ts                       # SPAYD + EPC QR generátor
  pdf.ts                      # html2canvas + jsPDF export
  supabase/client.ts
  supabase/server.ts
types/index.ts
supabase-schema.sql           # SQL schéma pro Supabase
```

## Stack
| | Verze |
|-|-------|
| Next.js | 16.2.7 |
| React | 19.x |
| Tailwind CSS | 4.x |
| @supabase/supabase-js | 2.x |
| qrcode | 1.5.4 |
| html2canvas + jsPDF | 1.4.1 + 4.2.1 |
