# Gmail → schvalovací fronta přijatých faktur

**Datum:** 2026-09-08
**Stav:** Návrh schválen, čeká na implementační plán

## Cíl

Změnit logiku načítání nových faktur z Gmailu do přijatých nákladů (`costs`).
Dnes tlačítko „Zkontrolovat Gmail" rovnou zapíše faktury do DB. Nově:

1. Check vyhledá nové emaily s fakturou a nabídne je v UI ke **schválení / odmítnutí**.
2. Teprve **schválení** zapíše údaje do databáze (`costs`).
3. Každé rozhodnutí (approved / rejected) se trackuje.
4. Pokud už o emailu (resp. o dvojici `message_id:attachment_id`) existuje záznam
   o zpracování, při dalším checku se v UI **vůbec nenabídne**.

## Rozhodnutí z brainstormingu

- **Čekající faktury:** perzistentní staging tabulka v DB (`gmail_pending`), ne efemérní stav v prohlížeči. Zapadá do dnešního inkrementálního modelu s `gmail_integration.history_id`.
- **Přílohy:** stahují se z Gmailu a nahrávají do Storage **až při schválení** (lazy). Odmítnuté/čekající faktury nezabírají místo.
- **Editace:** rozparsovaná pole jsou **editovatelná před schválením** (parser je heuristický a často vrací prázdné hodnoty).
- **Odmítnuté:** jen se uloží stav `rejected` a email navždy zmizí z nabídky. Žádné UI pro přehled/vrácení (YAGNI).
- **Umístění UI:** sekce „Ke schválení" **nahoře na `/costs`** (stejná stránka jako tabulka faktur).
- **Náhled PDF:** **lazy na kliknutí**, ne hned u všech.

## Výchozí stav (dnešní architektura)

- Supabase (Postgres + Storage), bez ORM. Gmail integrace ručně přes `fetch` (bez `googleapis`).
- Tlačítko „Zkontrolovat Gmail" v `components/costs/CostListClient.tsx` → server action `syncGmailCosts()` v `lib/gmail.ts`.
- `syncGmailCosts()` refreshne token, načte dedup set z `gmail_processed`, `resolveCandidateMessages` (inkrementální přes History API / fallback full resync), pak per zpráva `processOneMessage` → `createCost()` (`lib/costs.ts`) + `uploadCostFile()` + insert `gmail_processed`.
- Zápis nákladů: tabulka `costs`, přes `lib/costs.ts` (`createCost`, `uploadCostFile`). Gmail importy mají `source='gmail'`.
- Dedup dnes: `gmail_processed` PK `(message_id, attachment_id)`, `attachment_id='body'` pro HTML-only emaily; `cost_id ... on delete set null` (dedup přežije smazání nákladu).
- Parsování: `parseEmailFields` / `parseSender` v `lib/gmail-api.ts` — heuristika (VS, číslo faktury, total+měna, splatnost).
- Schéma: `supabase-schema.sql` (kanonické). `costs.extraction jsonb` existuje, ale není nikde plněno.

## Datový model

### Nová tabulka `gmail_pending`

Čekající faktury mezi checkem a rozhodnutím.

| sloupec | typ | pozn. |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `message_id` | `text not null` | |
| `attachment_id` | `text not null` | `'body'` pro HTML-only email |
| `parsed` | `jsonb not null` | draft ve tvaru `CostFormData` (editovatelný) |
| `email_subject` | `text` | pro seznam |
| `email_from` | `text` | pro seznam |
| `received_date` | `date` | z `internalDate` |
| `attachment_name` | `text` | název PDF, `null` u body |
| `has_pdf` | `boolean not null default false` | |
| `created_at` | `timestamptz not null default now()` | |

- `unique (message_id, attachment_id)` — opakovaný check nezdvojí řádek.
- RLS konzistentní s ostatními tabulkami (admin/authenticated dle stávajícího vzoru).

### Rozšíření `gmail_processed`

- Přidat `decision text not null check (decision in ('approved','rejected'))`.
- `cost_id` zůstává (`null` u `rejected`), PK `(message_id, attachment_id)` beze změny.
- Migrace: existující řádky reprezentují dřívější auto-importy → `decision` default `'approved'` pro backfill, pak sloupec `not null`.

## Toky

### Check — `checkGmail()` (refaktor `syncGmailCosts`)

1. Načti `gmail_integration`, refresh access tokenu.
2. Načti **dva** dedup sety: klíče z `gmail_processed` (jakékoli `decision`) **a** klíče z `gmail_pending`.
3. `resolveCandidateMessages` beze změny (inkrementální přes `history_id`, fallback full resync na první běh / expirovanou kotvu).
4. Pro každý nový kandidát (klíč není v processed ani v pending): `getMessage` → parsuj pole → **insert do `gmail_pending`**. Žádný `createCost`, žádný upload přílohy.
5. `history_id` se posune po čistém běhu jako dnes — bezpečné, protože nerozhodnuté položky žijí v `gmail_pending`.
6. Vrať počet nových pending → toast „X nových faktur ke schválení". `revalidatePath('/costs')`.

### UI — sekce „Ke schválení" na `/costs`

- Nová komponenta `PendingGmailList.tsx`, renderovaná nahoře nad tabulkou „Přijaté faktury".
- `app/(app)/costs/page.tsx` načte řádky `gmail_pending` a předá je klientu (spolu se stávajícími `costs`, `gmailReady`).
- Každý řádek = editovatelný formulář, znovupoužije pole a Zod validaci z existujícího Cost formuláře.
- Náhled PDF **lazy na kliknutí** přes server action `getPendingAttachmentPreview(id)`, která refreshne token a stáhne přílohu z Gmailu na vyžádání.
- Tlačítka **Schválit** / **Odmítnout** per řádek.
- React keys: `pending.id` (ne index).

### Schválení — `approvePending(id, editedForm)`

1. Validace `editedForm` přes `CostFormDataSchema`.
2. **Claim guard:** smaž `gmail_pending` řádek podle `id` a zkontroluj, že se smazal 1 řádek; když 0, někdo už rozhodl → skonči bez chyby.
3. Refresh token; pokud `has_pdf` (`attachment_id != 'body'`), stáhni přílohu base64 z Gmailu.
4. `createCost(form)` (`source='gmail'`) → `costId`.
5. Pokud PDF: `uploadCostFile(costId, name, base64)`. Jinak ulož HTML body jako `faktura.html` (jako dnes).
6. Insert `gmail_processed(message_id, attachment_id, decision='approved', cost_id=costId)`.
7. `revalidatePath('/costs')`.
8. Chyba po claimu (refresh/fetch/createCost selže): vrať pending řádek zpět (reinsert), aby se položka neztratila, a vrať chybu.

### Odmítnutí — `rejectPending(id)`

1. Claim guard: smaž `gmail_pending` řádek; když 0, skonči.
2. Insert `gmail_processed(message_id, attachment_id, decision='rejected', cost_id=null)`.
3. `revalidatePath('/costs')`.

### `reimportAllGmail`

Rozšířit: vyčisti `gmail_pending` i `gmail_processed`, smaž `source='gmail'` náklady + jejich soubory ve Storage, nulluj `history_id`, pak `checkGmail()`. Výsledek: vše spadne zpět **do fronty ke schválení** (ne auto-import), konzistentně s novým modelem.

## Granularita

Per-attachment (per PDF), stejně jako dnešní `gmail_processed` a `createCost` (jeden náklad na PDF). Email s více PDF → více pending řádků, schvalují/odmítají se nezávisle. HTML-only email → jeden řádek s `attachment_id='body'`.

## Dotčené soubory

- `supabase-schema.sql` — nová `gmail_pending`, sloupec `decision` na `gmail_processed`.
- `supabase/migrations/<nová>.sql` — DDL migrace (tabulka + sloupec + backfill + RLS).
- `lib/gmail.ts` — `syncGmailCosts` → `checkGmail` (insert do pending); nové `approvePending`, `rejectPending`, `getPendingAttachmentPreview`; úprava `reimportAllGmail`. Případně `listPendingGmail` (nebo načtení přímo v page).
- `lib/schemas.ts` — typ + Zod pro `GmailPending` / `parsed` draft.
- `components/costs/PendingGmailList.tsx` — nová komponenta fronty.
- `components/costs/CostListClient.tsx` — handler tlačítka na `checkGmail`, upravený toast; render/napojení pending sekce.
- `app/(app)/costs/page.tsx` — načtení pending řádků, předání do klienta.
- `components/costs/GmailIntegrationSettings.tsx` — „Zkontrolovat teď" volá stejný `checkGmail`.

## Ošetření chyb / hrany

- Selhání refresh tokenu při approve → chyba, pending řádek zachován (reinsert po claimu).
- Selhání stažení přílohy při approve → náklad se nevytvoří, pending zachován.
- Dvojklik / souběžné rozhodnutí → claim guard přes smazání pending řádku.
- Expirovaná history kotva (404) → full resync jako dnes; dedup přes processed+pending zabrání duplicitám.
- Náklad smazán po schválení → `gmail_processed` zůstává (`cost_id` → null), email se znovu nenabídne (zachováno z dnešního chování).

## Testy

- Unit: čistá logika — `parseEmailFields`/`parseSender`, sestavení dedup množiny (processed ∪ pending), rozhodnutí, který kandidát je „nový".
- Integračně/manuálně (Supabase bez ORM): approve → vznikne `costs` řádek + `gmail_processed(approved)` + zmizí z pending; reject → jen `gmail_processed(rejected)`; re-check → nenabídne nic z processed ani pending.

## Konvence

- Anglické názvy souborů.
- Bez `any` (přesné typy / `unknown` / type importy).
- Žádné React index keys — používat `pending.id`.
- Před psaním kódu projít `node_modules/next/dist/docs/` (dle `AGENTS.md`) pro aktuální konvence server actions.

## Mimo rozsah (YAGNI)

- UI pro přehled/vrácení odmítnutých faktur.
- AI/vylepšené parsování (`costs.extraction` zůstává nevyužité).
- Bulk approve/reject (zatím per řádek).
