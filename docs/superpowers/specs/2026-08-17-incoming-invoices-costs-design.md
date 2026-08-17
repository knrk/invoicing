# Náklady (příchozí faktury) — návrh

> Datum: 2026-08-17
> Stav: schváleno k implementaci (čeká na review uživatele)

## Cíl

Přidat do fakturační appky evidenci **nákladů = příchozích faktur**. Dva způsoby vstupu:

1. **Ruční upload** PDF faktury + formulář.
2. **Napojení Gmailu** — pravidelná kontrola jednoho konkrétního labelu, import PDF příloh jako nákladů.

### Účel (dle priority)
- Evidence + archiv příchozích faktur (PDF, stav zaplaceno/splatnost).
- Cashflow přehled (kolik dlužím, co je po splatnosti).
- Podklady pro účetního (export za období + přílohy).
- (později) Detekce EU dodavatele → reverse charge / DPH souvislosti.

## Klíčová technická rozhodnutí

- **Gmail klient**: přímé REST volání Gmail API + OAuth token endpoint přes `fetch`. Bez balíku `googleapis` (příliš velký). Scope pouze `gmail.readonly`.
- **Úložiště PDF**: Supabase Storage, privátní bucket `costs`. V DB jen `file_path`; zobrazení přes signed URL vytvořenou v server action.
- **OAuth token**: samostatná jednořádková tabulka `gmail_integration`. Bezpečnostní pozn.: při současném `anon` RLS je token reálně nechráněný — stejná úroveň jako zbytek appky. Řešit před veřejným deployem spolu s přechodem na `auth.uid()` RLS.
- **Dedup Gmailu**: samostatná tabulka `gmail_processed` (message_id + attachment_id, unique), aby smazání nákladu nezpůsobilo opětovný import.
- **Spouštění synchronizace**: `syncGmailCosts()` je čistá funkce volatelná z tlačítka „zkontrolovat teď" i z budoucího Vercel Cronu — cron se přidá jen jako tenká API route.

## Datový model

### Tabulka `costs`
```sql
create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  supplier jsonb not null default '{}',      -- { name, ico, dic, street, zip, city, country }
  invoice_number text not null default '',   -- číslo faktury dodavatele
  variable_symbol text not null default '',
  currency text not null check (currency in ('CZK','EUR')) default 'CZK',
  issue_date date,
  due_date date,
  received_date date,                        -- kdy faktura přišla / byla naimportována
  total numeric(12,2) not null default 0,
  vat_amount numeric(12,2),                  -- DPH na vstupu (fáze VAT)
  reverse_charge boolean not null default false,  -- EU dodavatel (fáze VAT)
  is_eu_supplier boolean not null default false,  -- odvozeno z DIČ/country (fáze VAT)
  note text not null default '',
  paid_at timestamptz,                       -- stejný vzor jako invoices
  file_path text,                            -- Supabase Storage cesta k PDF
  file_name text,
  source text not null check (source in ('upload','gmail')) default 'upload',
  extraction jsonb,                          -- surový výstup AI extrakce (fáze AI)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costs_created_at_idx on costs (created_at desc);
create index if not exists costs_due_date_idx on costs (due_date);
alter table costs enable row level security;
create policy "anon full access costs" on costs for all to anon using (true) with check (true);
```

### Tabulka `gmail_integration` (jednořádková)
```sql
create table if not exists gmail_integration (
  id integer primary key default 1,
  email text,
  refresh_token text,
  label_id text,
  label_name text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gmail_integration_single_row check (id = 1)
);
alter table gmail_integration enable row level security;
create policy "anon full access gmail_integration" on gmail_integration for all to anon using (true) with check (true);
```

### Tabulka `gmail_processed` (dedup)
```sql
create table if not exists gmail_processed (
  message_id text not null,
  attachment_id text not null,
  cost_id uuid references costs(id) on delete set null,
  processed_at timestamptz not null default now(),
  primary key (message_id, attachment_id)
);
alter table gmail_processed enable row level security;
create policy "anon full access gmail_processed" on gmail_processed for all to anon using (true) with check (true);
```

### Supabase Storage
- Privátní bucket `costs`. Cesta `costs/{cost_id}/{file_name}`.
- Čtení výhradně přes signed URL vytvořenou server actionem (nikdy public URL).

## Server vrstva (`lib/`)

### `lib/costs.ts` (server actions)
| Akce | Popis |
|------|-------|
| `getCosts(filters?)` | Seznam nákladů, řazení `created_at desc`, filtr zaplaceno/období |
| `getCost(id)` | Jeden náklad |
| `createCost(form)` | Vytvoří náklad |
| `updateCost(id, form)` | Aktualizuje náklad |
| `deleteCost(id)` | Smaže náklad (+ soubor ze Storage) |
| `setCostPaidAt(id, paidAt)` | Nastaví/zruší datum zaplacení |
| `uploadCostFile(costId, file)` | Uloží PDF do Storage, nastaví `file_path`/`file_name` |
| `getCostFileUrl(id)` | Vrátí signed URL k PDF |
| `exportCostsCsv(period)` | CSV nákladů za období |
| `exportCostsZip(period)` | ZIP s PDF přílohami (`jszip`) |

### `lib/gmail.ts`
- OAuth: `getAuthUrl()`, `exchangeCodeForTokens(code)`, `getAccessToken()` (z refresh tokenu).
- `listLabels()` — pro výběr labelu v Settings.
- `syncGmailCosts()` — čistá funkce: podle `label_id` vylistuje zprávy → pro každou dosud nezpracovanou stáhne PDF přílohy → upload do Storage → `costs` řádek (`source='gmail'`, prázdná/částečná pole ke kontrole) → zápis do `gmail_processed`. Aktualizuje `last_sync_at`. Vrací souhrn (počet nových / přeskočených / chyby).

### API routes
- `GET /api/integrations/gmail/connect` → redirect na Google consent.
- `GET /api/integrations/gmail/callback` → výměna code za tokeny, uložení do `gmail_integration`, redirect zpět do Settings.
- (fáze Gmail, cron-ready) `GET /api/cron/gmail-sync` → zavolá `syncGmailCosts()` (ochrana tajemstvím v hlavičce).

### `lib/schemas.ts`
- Zod `CostFormSchema` + typ `CostFormData`, typ `Cost` (extends + id/timestamps/paid_at), typ `GmailIntegration`.

## UI

- **Sidebar**: nová položka „Náklady" (ikona `Receipt` z lucide), zařazená za „Faktury".
- **`/costs`** (server component → client list): tabulka (dodavatel, číslo, datum vystavení, splatnost, částka, měna, stav), filtry zaplaceno/nezaplaceno + období, součet. Tlačítka „Nahrát fakturu" (dialog s uploadem + formulářem) a „Zkontrolovat Gmail" (jen když je integrace připojená). Export CSV / ZIP za období.
- **Detail nákladu** (`/costs/[id]` nebo dialog): editační formulář + náhled PDF (iframe se signed URL), toggle zaplaceno.
- **Settings** → sekce „Napojení Gmailu": stav (připojeno jako `email`), výběr labelu z dropdownu, „připojit"/„odpojit", poslední synchronizace, „zkontrolovat teď".
- **Dashboard**: karta cashflow — nezaplacené náklady celkem a částka po splatnosti.

Komponenty (angl. názvy dle CLAUDE.md): `components/costs/CostListClient.tsx`, `CostForm.tsx`, `CostUploadDialog.tsx`, `CostFilePreview.tsx`, `GmailIntegrationSettings.tsx`.

## Fázování

1. **MVP** — model `costs` + Storage bucket + ruční upload + `CostForm` + list + náhled PDF + paid toggle + cashflow karta na dashboardu + export CSV/ZIP pro účetního.
2. **Gmail** — tabulky `gmail_integration`/`gmail_processed`, OAuth connect/callback, výběr labelu v Settings, `syncGmailCosts()` + tlačítko „zkontrolovat teď", dedup. Architektura připravená pro Vercel Cron.
3. **DPH / EU dodavatel** — detekce EU dodavatele z DIČ (reuse `EU_MEMBER_STATES` z `vat-recapitulative-statement.ts`), `reverse_charge`/`is_eu_supplier`, pole `vat_amount`, návaznost na daňové přehledy.
4. **AI extrakce** — předvyplnění `CostForm` z PDF přes Anthropic / Vercel AI Gateway; výsledek do `extraction jsonb`, uživatel jen kontroluje/opravuje. (Poslední kvůli API nákladům.)

## Error handling
- Upload: validace typu (PDF) a velikosti; při selhání Storage se `costs` řádek buď nevytvoří, nebo se rollbackne.
- Gmail sync: chyby per-zpráva se logují a přeskakují, sync nespadne celý; návratový souhrn s počty a chybami; toast v UI. Expirovaný/odvolaný refresh token → stav „odpojeno" + výzva k opětovnému připojení.
- Signed URL má krátkou expiraci; generuje se on-demand.

## Testování
- `lib/costs.ts` a `lib/gmail.ts` parsovací/mapovací helpery jako čisté funkce → jednotkové testy (parsování Gmail message → přílohy, mapování na `CostFormData`, CSV generování).
- Dedup: opakovaný `syncGmailCosts()` nesmí vytvořit duplicity.

## Mimo rozsah (YAGNI)
- Parsování odkazů/těla e-mailu (jen PDF přílohy).
- Obrázkové přílohy (JPG/PNG) — případně později.
- Zápis do Gmailu (labely/označení) — dedup řešíme v DB, scope zůstává read-only.
- Vícero připojených e-mailových účtů — zatím jeden.

## Implementační poznámky
- Před psaním kódu číst relevantní guide v `node_modules/next/dist/docs/` (viz AGENTS.md — tato verze Next.js má odlišnosti).
- Dodržet coding rules: anglické názvy souborů, žádné `any`, stabilní React keys.
- Env proměnné (do `.env.local`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CRON_SECRET` (fáze cron).
