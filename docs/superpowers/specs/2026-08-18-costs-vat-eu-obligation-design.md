# Náklady — Fáze 3: DPH/EU + agregovaná kontrola hlášení

**Datum:** 2026-08-18
**Stav:** Návrh ke schválení

## Cíl

Zpřístupnit u přijatých faktur (nákladů) příznaky DPH/EU a na stránce
**Souhrnné hlášení** doplnit kontrolu, která u každého měsíce agregovaně ukáže,
zda vzniká povinnost hlášení — a to jak z **vydaných** faktur (stávající souhrnné
hlášení), tak z **přijatých** faktur (pořízení z EU / přenesená daňová povinnost).

AI extrakci a CSV export **neřešíme** (mimo rozsah).

## Věcný kontext (terminologie)

- **Vydané** EU faktury → **Souhrnné hlášení** (§102), generuje se XML (už existuje).
- **Přijaté** faktury s EU dodavatelem / přenesenou DP → nejdou do souhrnného
  hlášení, ale do **přiznání k DPH (samovyměření)**, případně kontrolního hlášení.
  Negenerují XML — jsou jen informační kontrola.

Stránka zůstává pojmenovaná „Souhrnné hlášení". Úvodní text stránky se upraví, aby
zmínil i přijaté faktury a kam patří.

## Datový model

Beze změny — pole už v `costs` existují (`lib/schemas.ts`):
`is_eu_supplier: boolean`, `reverse_charge: boolean`, `vat_amount: number | null`.
Žádná migrace DB.

## Komponenty a změny

### 1. Formulář nákladu — `components/costs/CostForm.tsx`

Za pole „Celkem" přidat dva **nezávislé** přepínače (shadcn `Switch`, stejný vzor
jako přepínač měny):

- **„Přenesená daňová povinnost"** → `reverse_charge`
- **„Dodavatel z EU"** → `is_eu_supplier`

Bez auto-výpočtů a bez vzájemného provázání (EU nezapíná automaticky reverse charge).
Pole „DPH" (`vat_amount`) se **nepřidává**. `emptyCostForm()` už tato pole má.

### 2. Nová lib pro přijatou stranu — `lib/vat-obligation-overview.ts`

Čistá agregační vrstva nad oběma zdroji. Nemění stávající
`lib/vat-recapitulative-statement.ts` (výpočet vydaných + XML zůstává beze změny).

```ts
export interface ReceivedObligationCost {
  id: string
  supplier_name: string
  invoice_number: string
  total: number
  currency: Currency
  is_eu_supplier: boolean
  reverse_charge: boolean
}

export interface ReceivedObligationData {
  rok: number
  mesic: number
  costs: ReceivedObligationCost[]  // faktury s is_eu_supplier || reverse_charge
  totalCzk: number                 // součet CZK nákladů
  totalEur: number                 // součet EUR nákladů
}

// Filtruje costs daného měsíce (podle issue_date) na kvalifikující se
// (is_eu_supplier || reverse_charge) a vrací souhrn per měna.
export function buildReceivedObligationData(
  costs: Cost[], rok: number, mesic: number,
): ReceivedObligationData

// Sjednocení dokončených měsíců (ym < aktuální měsíc) z faktur i nákladů,
// newest-first. Rozšiřuje stávající monthsFromInvoices o měsíce z costs.
export function completedMonths(
  invoices: Invoice[], costs: Cost[],
): { rok: number; mesic: number }[]
```

**Podmínka povinnosti (přijaté):** aspoň jedna přijatá faktura v měsíci s
`is_eu_supplier === true || reverse_charge === true`.

**Měsíce:** pouze dokončené (`ym < aktuální ym`), konzistentně se stávající sekcí.

### 3. Stránka — `app/vat-recapitulative-statement/page.tsx`

- Načíst `getInvoices()`, `getCosts()`, `getConfig()`.
- Měsíce = `completedMonths(invoices, costs)`.
- Pro každý měsíc spočítat:
  - výdaje: `buildVatRecapStatementData(invoices, rok, mesic)` (beze změny)
  - příjmy: `buildReceivedObligationData(costs, rok, mesic)`
- Předat oba datové bloky do klienta.
- Upravit úvodní odstavec (zmínit i přijaté faktury / přiznání k DPH).

### 4. Klient — `components/vat-recapitulative-statement/VatRecapStatementClient.tsx`

**Jeden řádek na měsíc** (žádné oddělené sekce vydané/přijaté). Řádek obsahuje:

- **Ikona stavu:** povinnost (accent) když `outgoing.rows.length > 0` **nebo**
  `received.costs.length > 0`; chyba (danger) při chybě výpočtu vydaných; warning
  když jen vyloučené vydané faktury; jinak šedý `Circle` „bez povinnosti".
- **Popisek měsíce** (např. „Srpen 2026").
- **Dvě částky odděleně** (sčítat dohromady se nesmí):
  - Vydané: `{počet} dokladů · {CZK} Kč`
  - Přijaté: `{počet} dokladů · {CZK} Kč / {EUR} €` (jen neprázdné měny)
  - Rozlišené krátkým popiskem („Vydané" / „Přijaté"), ne jako oddělené bloky.
- **XML export** jen když má měsíc vydané EU faktury (`outgoing.rows.length > 0`).
  Přijaté XML nemají.
- Stávající **warning řádky** vyloučených vydaných faktur zůstávají.
- Pod řádkem kompaktní seznam kvalifikujících se **přijatých** faktur (dodavatel,
  číslo, částka, příznak PDP/EU) s odkazem na `/costs/{id}` — stejný vzor jako
  stávající warning řádky.

Prop typ klienta rozšířit o `received: ReceivedObligationData`.

## Chování / hraniční případy

- Měsíc jen s přijatou povinností (žádné vydané) → řádek „povinnost", bez XML,
  s detailem přijatých faktur.
- Měsíc bez čehokoli kvalifikujícího → šedý „bez povinnosti" (jako dnes).
- Náklad bez `issue_date` → do žádného měsíce nespadá (přeskočí se).
- Smíšené měny přijatých → zobrazit součet per měna, nikdy nesečíst dohromady.

## Testování / ověření

- `npx biome lint` na dotčené soubory + `npx tsc --noEmit`.
- Browser preview: vytvořit náklad s „Dodavatel z EU" v dokončeném měsíci →
  ověřit, že se měsíc objeví jako „povinnost" s přijatým dokladem v detailu a bez
  XML tlačítka (pokud nemá vydané EU faktury).
- Ověřit, že stávající vydané souhrnné hlášení + XML export fungují beze změny.

## Mimo rozsah

CSV export (rušíme), sazby DPH, automatické výpočty základu/DPH, XML pro přijaté,
AI extrakce, kontrolní hlášení jako samostatný výstup.
