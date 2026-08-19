# Globální filtr roku — design

**Datum:** 2026-08-19
**Stav:** schváleno k implementaci

## Cíl

Přidat globální filtr roku — textový dropdown s číslem roku vedle názvu „Fakturace"
v sidebaru. Vybraný rok je jeden globální stav, který omezuje **všechny relevantní
pohledy a exporty** tak, aby uživatel viděl jen faktury (vydané i přijaté) daného roku.

## Kontext (současný stav)

- Data se načítají **serverově** (server komponenty / server actions) a celá sada se
  předává klientským komponentám, které filtrují **na klientu**.
- **Vydané** (`components/invoice/InvoiceListClient.tsx`): tabulka zobrazuje všechny
  roky; statistické karty „Fakturace {rok}" počítají natvrdo `new Date().getFullYear()`;
  Export ZIP (`exportAllToPDF`, klientský) exportuje **všechny** faktury.
- **Přijaté** (`components/costs/CostListClient.tsx`): už natvrdo filtruje jen aktuální
  rok (`const currentYear = String(new Date().getFullYear())`, filtr přes
  `issue_date.startsWith(currentYear)`); Export ZIP volá server action
  `exportCostsZip(period)` a předává `currentYear`.
- **Souhrnné hlášení** (`app/vat-recapitulative-statement/page.tsx` +
  `VatRecapStatementClient`): server předpočítá `monthData` pro **všechny** měsíce napříč
  roky.
- Rok vydané faktury = `issue_date` (`YYYY-MM-DD`, vždy vyplněné).
- Rok nákladu: `issue_date` je volitelné (může být `""`), navíc existuje `received_date`.
- Nadpis „Fakturace" je **brand v Sidebaru** (`components/ui/Sidebar.tsx`, vlevo nahoře),
  vykreslený jen v rozbaleném stavu (`!collapsed`).
- Root `app/layout.tsx` je **server komponenta** (může `await`).

## Rozhodnutí (z brainstormingu)

1. **Umístění:** dropdown v sidebaru vedle brandu „Fakturace".
2. **Datum pro určení roku:** vydané faktury podle `issue_date`; přijaté faktury podle
   `issue_date` s fallbackem na `received_date`.
3. **Nabídka let:** jen roky, kde existují data, + vždy aktuální rok; **default = aktuální
   rok**, jinak nejnovější rok s daty. Bez volby „Vše".
4. **Rozsah:** filtr ovlivní Vydané, Přijaté i Souhrnné hlášení (jen měsíce daného roku).
   Na stránkách Odběratelé / Dodavatelé / Nastavení je dropdown vidět, ale bez efektu.

## Architektura

Protože seznamy i tak dostávají kompletní data a filtrují na klientu, stačí **jeden
klientský globální stav (React Context)**. Žádné serverové refetche při přepnutí roku →
přepínání je okamžité. Souhrnné hlášení dostává předpočítané měsíce a filtruje se rovněž
na klientu.

### Komponenty a jednotky

**1. `getAvailableYears()` — serverová funkce**
- Umístění: `lib/actions.ts` (vedle ostatních server actions) nebo nový `lib/year-filter.ts`.
  Preferováno `lib/actions.ts` kvůli přístupu k Supabase klientovi a konzistenci.
- Dělá: `select("issue_date")` z `invoices`; `select("issue_date, received_date")`
  z `costs`. Z každého záznamu odvodí rok:
  - faktura: první 4 znaky `issue_date`.
  - náklad: `issue_date` neprázdné → jeho rok; jinak `received_date` → jeho rok; jinak
    přeskočit.
- Přidá vždy aktuální rok (`new Date().getFullYear()`).
- Vrátí unikátní roky jako `number[]`, seřazené **sestupně**.
- Vstup: žádný. Výstup: `Promise<number[]>`. Závislosti: Supabase server klient.

**2. `YearFilterProvider` — klientský provider**
- Nový soubor `components/year-filter/YearFilterProvider.tsx` (`"use client"`).
- Props: `availableYears: number[]`, `initialYear: number`.
- Drží stav `year` (`number`), poskytuje context `{ year, setYear, availableYears }`.
- `setYear(y)`: nastaví stav a zapíše cookie `year-filter=<rok>` (persistence napříč
  reloady; `path=/`, `max-age` ~1 rok).
- Export hooku `useYearFilter()` vracejícího context; mimo provider vyhodí chybu.
- Vstup: children + props. Výstup: context. Závislosti: React.

**3. Určení `initialYear` (v `app/layout.tsx`, server)**
- Přečíst cookie `year-filter` přes `cookies()` z `next/headers`.
- Kandidát = číslo z cookie, pokud je platné a je v `availableYears`.
- Jinak = aktuální rok, pokud je v `availableYears`.
- Jinak = nejvyšší (nejnovější) rok z `availableYears` (fallback pokud letos nic není).
- `availableYears` vždy obsahuje aktuální rok (viz `getAvailableYears`), takže seznam
  nikdy není prázdný.

**4. `YearSelect` — klientský dropdown**
- Nový soubor `components/year-filter/YearSelect.tsx` (`"use client"`).
- Používá `useYearFilter()`. Vykreslí textový `<select>` (nebo shadcn `Select`, viz níže)
  s roky z `availableYears`; změna volá `setYear`.
- Styl: kompaktní, ladí s brandem v sidebaru.
- **Volba komponenty:** projekt má `components/ui/select.tsx` (Radix). Kvůli jednoduchému
  textovému vzhledu vedle brandu použít **nativní `<select>`** stylovaný Tailwindem —
  méning overhead, snadné v úzkém sidebaru. (Rozhodnutí implementace; není blokující.)

**5. Zapojení v `app/layout.tsx`**
- `const availableYears = await getAvailableYears()`.
- Vypočítat `initialYear` (viz bod 3).
- Obalit `<Sidebar />` i `{children}` do
  `<YearFilterProvider availableYears={...} initialYear={...}>`.

**6. `Sidebar.tsx`**
- Vedle brandu „Fakturace" (blok `!collapsed`, cca řádky 132–141) vložit `<YearSelect />`.
- Ve sbaleném stavu se — stejně jako brand — nezobrazí.

### Datový tok

```
app/layout.tsx (server)
  → getAvailableYears() + cookie "year-filter"
  → <YearFilterProvider availableYears initialYear>
        ├─ <Sidebar> → <YearSelect> (setYear → context + cookie)
        └─ {children}
              → InvoiceListClient / CostListClient / VatRecapStatementClient
                  → useYearFilter() → filtrují data podle year
```

## Dopad na pohledy

### Vydané — `InvoiceListClient.tsx`
- Zavést `const { year } = useYearFilter()`.
- Odvozený `yearInvoices = invoices.filter(i => i.issue_date.startsWith(String(year)))`.
- Počítadlo v hlavičce, statistické karty i tabulka pracují nad `yearInvoices`
  (respektive dále filtrované statusem).
- Karty „Fakturace {rok} — CZK/€" používají `year` místo `currentYear`
  (`new Date().getFullYear()`).
- `handleExportAll` exportuje `yearInvoices` (ne celé `invoices`); `disabled` a prázdné
  stavy se počítají z `yearInvoices`.
- Prázdný stav: „Žádné faktury v roce {year}" (odlišit od DB chyby, která má přednost).
- Pozn.: „Očekávaná platba" a „Po splatnosti" — rozhodnutí: **také omezit na vybraný
  rok** (`yearInvoices`), aby celý pohled Vydané odpovídal jednomu roku. (Konzistentní se
  zadáním „vidět jen patřičné faktury v daném roce".)

### Přijaté — `CostListClient.tsx`
- Nahradit `const currentYear = String(new Date().getFullYear())` hodnotou z
  `useYearFilter()`.
- Zavést pomocnou funkci `costYear(c)`: rok z `issue_date`, fallback `received_date`,
  jinak `null`.
- `filtered` používá `costYear(c) === year` místo `issue_date.startsWith(currentYear)`.
- Statistické karty („Náklady celkem", „Nezaplaceno", „Po splatnosti") — rozhodnutí:
  **omezit na vybraný rok** pro konzistenci celého pohledu.
- `handleExportZip` předá `String(year)` do `exportCostsZip`.
  - Pozn.: `exportCostsZip` (`lib/costs.ts`) filtruje přes `cost.issue_date.startsWith(period)`.
    Aby export odpovídal zobrazení (fallback na `received_date`), upravit `inPeriod` tak,
    aby použil stejnou logiku roku jako `costYear` (issue_date, fallback received_date).

### Souhrnné hlášení — `VatRecapStatementClient.tsx`
- Zavést `useYearFilter()` a zobrazit jen měsíce, kde `month.rok === year`.
- Server (`page.tsx`) zůstává beze změny (počítá všechny měsíce); filtr je na klientu.
- Prázdný stav pokud v daném roce nejsou žádné měsíce s povinností.

## Chybové stavy a okrajové případy

- **DB chyba** ve Vydaných (`dbError`) má přednost před prázdným stavem roku.
- **Cookie s neplatnou/neexistující hodnotou** → fallback dle bodu 3 (žádný pád).
- **Hydratace:** cookie čtená serverem zajistí shodný `initialYear` na serveru i klientu →
  žádný flicker ani mismatch.
- **Sbalený sidebar:** `YearSelect` se skryje spolu s brandem (přijato v brainstormingu).
- **Rok bez dat, ale aktuální:** aktuální rok je vždy v `availableYears`, takže default
  funguje i pro čerstvě prázdný rok.

## Testování / ověření

- Ruční ověření v dev serveru (`pnpm dev`, port 3030) přes preview nástroje:
  - Přepnutí roku v dropdownu okamžitě mění Vydané, Přijaté i Souhrnné hlášení.
  - Statistické karty Vydané ukazují vybraný rok.
  - Export ZIP (Vydané i Přijaté) obsahuje jen faktury vybraného roku.
  - Reload zachová vybraný rok (cookie).
  - Sbalení sidebaru skryje dropdown; rozbalení ho vrátí se stejnou hodnotou.
- `biome lint .` (součást `pnpm build`) bez chyb.

## Mimo rozsah (YAGNI)

- Volba „Vše" / více roků najednou.
- Filtr na stránkách Odběratelé / Dodavatelé / Nastavení (dropdown tam je bez efektu).
- Rozsahy měsíců / kvartálů.
- Serverové re-filtrování dat (vše řešeno na klientu nad již načtenými daty).

## Konvence

- Názvy souborů anglicky (`YearFilterProvider.tsx`, `YearSelect.tsx`).
- Bez `any`; přesné typy.
- React klíče = stabilní identifikátor (rok jako number/string je stabilní).
- Před psaním kódu dotčených Next.js API (`cookies()` z `next/headers`) ověřit v
  `node_modules/next/dist/docs/` (dle AGENTS.md — tato verze Next.js má odchylky).
