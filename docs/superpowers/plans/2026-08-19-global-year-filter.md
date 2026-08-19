# Global Year Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global year dropdown next to the „Fakturace" brand in the sidebar that scopes all invoice/cost views and their exports to the selected year.

**Architecture:** A single client-side React Context (`YearFilterProvider`) wraps the app in the root layout. The initial year is resolved on the server from a `year-filter` cookie (so SSR and client agree — no hydration flicker); the selection persists back to that cookie via `document.cookie` on the client. All list/report components already receive full datasets and filter on the client, so they simply read the shared year — no server refetch on change. Pure, isomorphic helpers in `lib/year-filter.ts` are the single source of truth for deriving a record's year.

**Tech Stack:** Next.js 16.2.7 (App Router, async `cookies()` from `next/headers`), React 19, TypeScript, Tailwind, Supabase, Biome (lint).

**Testing note:** This repo has **no unit-test runner** (package.json only has `lint` = Biome and `build` = `biome lint . && next build`). Introducing a test framework is out of scope (YAGNI, follow existing patterns). Each task is therefore verified with **`pnpm lint`** (Biome), **`npx tsc --noEmit`** (typecheck), and — at integration points — **manual browser verification** via the dev server on port 3030. This is the honest verification gate for this codebase.

**Spec:** `docs/superpowers/specs/2026-08-19-global-year-filter-design.md`

---

## File Structure

- **Create** `lib/year-filter.ts` — isomorphic pure helpers: `YEAR_COOKIE`, `yearFromDate`, `invoiceYear`, `costYear`, `resolveInitialYear`. No `"use client"`/`"use server"` directive → usable from both server and client.
- **Create** `components/year-filter/YearFilterProvider.tsx` (`"use client"`) — context provider + `useYearFilter()` hook.
- **Create** `components/year-filter/YearSelect.tsx` (`"use client"`) — the dropdown, consumes the hook.
- **Modify** `lib/actions.ts` — add `getAvailableYears()` server action.
- **Modify** `app/layout.tsx` — fetch years, read cookie, resolve initial year, wrap children in the provider.
- **Modify** `components/ui/Sidebar.tsx` — render `<YearSelect />` next to the brand.
- **Modify** `components/invoice/InvoiceListClient.tsx` — scope view/stats/export to the year.
- **Modify** `components/costs/CostListClient.tsx` — replace hardcoded current year with the selected year; pass it to export.
- **Modify** `lib/costs.ts` — unify `exportCostsZip` period matching with `costYear` (issue_date → received_date fallback).
- **Modify** `components/vat-recapitulative-statement/VatRecapStatementClient.tsx` — show only the selected year's months.

---

## Task 0: Feature branch

- [ ] **Step 1: Create and switch to a feature branch**

Run:
```bash
git checkout -b feature/global-year-filter
```
Expected: `Switched to a new branch 'feature/global-year-filter'`

(The working tree already has unrelated changes in `lib/actions.ts`, `instrumentation.ts`, `lib/mem-probe.ts` from an OOM probe — leave them untouched and never `git add .`; stage only the files each task names.)

---

## Task 1: Isomorphic year helpers + `getAvailableYears`

**Files:**
- Create: `lib/year-filter.ts`
- Modify: `lib/actions.ts` (add import near top; add `getAvailableYears` export)

- [ ] **Step 1: Create `lib/year-filter.ts`**

```ts
import type { Cost, Invoice } from "@/types"

/** Cookie name for the persisted global year filter. */
export const YEAR_COOKIE = "year-filter"

/** Parse the 4-digit year from a YYYY-MM-DD string. Returns null for empty/invalid input. */
export function yearFromDate(dateStr: string): number | null {
  if (!dateStr) return null
  const year = Number.parseInt(dateStr.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

/** Year of an issued invoice — always from issue_date (always present). */
export function invoiceYear(invoice: Invoice): number | null {
  return yearFromDate(invoice.issue_date)
}

/** Year of a received invoice (cost) — issue_date, fallback to received_date. */
export function costYear(cost: Cost): number | null {
  return yearFromDate(cost.issue_date) ?? yearFromDate(cost.received_date)
}

/**
 * Resolve the initial selected year:
 *   valid cookie value that is available → current year if available → newest available.
 * `availableYears` must be non-empty and sorted descending (getAvailableYears guarantees both,
 * because it always includes the current year).
 */
export function resolveInitialYear(
  availableYears: number[],
  cookieValue: string | undefined
): number {
  const fromCookie = cookieValue ? Number.parseInt(cookieValue, 10) : Number.NaN
  if (!Number.isNaN(fromCookie) && availableYears.includes(fromCookie)) {
    return fromCookie
  }
  const currentYear = new Date().getFullYear()
  if (availableYears.includes(currentYear)) return currentYear
  return availableYears[0]
}
```

- [ ] **Step 2: Add `getAvailableYears` to `lib/actions.ts`**

Add this import alongside the other `@/lib/...` imports at the top of `lib/actions.ts`:
```ts
import { yearFromDate } from "@/lib/year-filter"
```

Append this exported async function at the end of `lib/actions.ts`:
```ts
export async function getAvailableYears(): Promise<number[]> {
  const supabase = await createClient()
  const [{ data: invoiceRows }, { data: costRows }] = await Promise.all([
    supabase.from("invoices").select("issue_date"),
    supabase.from("costs").select("issue_date, received_date"),
  ])

  const years = new Set<number>()
  years.add(new Date().getFullYear())

  for (const row of invoiceRows ?? []) {
    const y = yearFromDate(typeof row.issue_date === "string" ? row.issue_date : "")
    if (y !== null) years.add(y)
  }
  for (const row of costRows ?? []) {
    const issue = typeof row.issue_date === "string" ? row.issue_date : ""
    const received = typeof row.received_date === "string" ? row.received_date : ""
    const y = yearFromDate(issue) ?? yearFromDate(received)
    if (y !== null) years.add(y)
  }

  return [...years].sort((a, b) => b - a)
}
```

- [ ] **Step 3: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors. (If `tsc --noEmit` complains it emits, run `pnpm build` instead as the typecheck.)

- [ ] **Step 4: Commit**

```bash
git add lib/year-filter.ts lib/actions.ts
git commit -m "feat(year-filter): add year helpers and getAvailableYears"
```

---

## Task 2: `YearFilterProvider` + `useYearFilter` hook

**Files:**
- Create: `components/year-filter/YearFilterProvider.tsx`

- [ ] **Step 1: Create the provider**

```tsx
"use client"

import { YEAR_COOKIE } from "@/lib/year-filter"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

interface YearFilterValue {
  year: number
  setYear: (year: number) => void
  availableYears: number[]
}

const YearFilterContext = createContext<YearFilterValue | null>(null)

export function YearFilterProvider({
  availableYears,
  initialYear,
  children,
}: {
  availableYears: number[]
  initialYear: number
  children: React.ReactNode
}) {
  const [year, setYearState] = useState(initialYear)

  const setYear = useCallback((next: number) => {
    setYearState(next)
    // Persistence napříč reloady. Zápis cookie musí být na klientu —
    // Server Components cookie nastavovat nemohou (viz next/headers cookies docs).
    document.cookie = `${YEAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo(
    () => ({ year, setYear, availableYears }),
    [year, setYear, availableYears]
  )

  return <YearFilterContext.Provider value={value}>{children}</YearFilterContext.Provider>
}

export function useYearFilter(): YearFilterValue {
  const ctx = useContext(YearFilterContext)
  if (!ctx) throw new Error("useYearFilter must be used within a YearFilterProvider")
  return ctx
}
```

- [ ] **Step 2: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/year-filter/YearFilterProvider.tsx
git commit -m "feat(year-filter): add YearFilterProvider context and hook"
```

---

## Task 3: Wire the provider into the root layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace the contents of `app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import { cookies } from "next/headers"
import "./globals.css"
import Sidebar from "@/components/ui/Sidebar"
import { Toaster } from "@/components/ui/sonner"
import { YearFilterProvider } from "@/components/year-filter/YearFilterProvider"
import { getAvailableYears } from "@/lib/actions"
import { resolveInitialYear, YEAR_COOKIE } from "@/lib/year-filter"

export const metadata: Metadata = {
  title: "Fakturace",
  description: "Fakturační aplikace",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [availableYears, cookieStore] = await Promise.all([getAvailableYears(), cookies()])
  const initialYear = resolveInitialYear(availableYears, cookieStore.get(YEAR_COOKIE)?.value)

  return (
    <html lang="cs">
      <body suppressHydrationWarning className="flex h-screen overflow-hidden gap-3 p-3">
        <YearFilterProvider availableYears={availableYears} initialYear={initialYear}>
          <Sidebar />
          <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
        </YearFilterProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(year-filter): provide year context from root layout"
```

---

## Task 4: `YearSelect` dropdown in the sidebar

**Files:**
- Create: `components/year-filter/YearSelect.tsx`
- Modify: `components/ui/Sidebar.tsx` (add import; render inside the `!collapsed` brand block, ~lines 132–141)

- [ ] **Step 1: Create `components/year-filter/YearSelect.tsx`**

```tsx
"use client"

import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { cn } from "@/lib/utils"

export default function YearSelect({ className }: { className?: string }) {
  const { year, setYear, availableYears } = useYearFilter()
  return (
    <select
      aria-label="Filtr roku"
      value={year}
      onChange={(e) => setYear(Number(e.target.value))}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm font-semibold text-text-secondary tabular-nums outline-none transition-colors hover:bg-subtle hover:text-text focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {availableYears.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Import `YearSelect` in `components/ui/Sidebar.tsx`**

Add after the existing `import { cn } from "@/lib/utils"` line:
```tsx
import YearSelect from "@/components/year-filter/YearSelect"
```

- [ ] **Step 3: Render `YearSelect` next to the brand**

In `components/ui/Sidebar.tsx`, find the brand block:
```tsx
      {!collapsed && (
        <div className="flex items-center h-14 shrink-0 overflow-hidden gap-2.5 px-4">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ReceiptText className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-text tracking-tight whitespace-nowrap overflow-hidden">
            Fakturace
          </span>
        </div>
      )}
```
Replace it with (adds `<YearSelect className="ml-auto" />` pushed to the right; `shrink-0` on the brand name so the select never squeezes the title):
```tsx
      {!collapsed && (
        <div className="flex items-center h-14 shrink-0 overflow-hidden gap-2.5 px-4">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ReceiptText className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-text tracking-tight whitespace-nowrap overflow-hidden shrink-0">
            Fakturace
          </span>
          <YearSelect className="ml-auto shrink-0" />
        </div>
      )}
```

- [ ] **Step 4: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Browser verification**

Start the dev server and open it:
- `preview_start` with `{ name: "dev" }` (create `.claude/launch.json` if missing: runtimeExecutable `pnpm`, runtimeArgs `["dev"]`, port `3030`).
- Confirm the year dropdown renders next to „Fakturace" in the sidebar, lists years descending with the current year (2026) present and selected.
- Collapse the sidebar (chevron): dropdown hides with the brand. Expand: it returns with the same value.
- `read_console_messages` (onlyErrors): no hydration mismatch / context errors.

- [ ] **Step 6: Commit**

```bash
git add components/year-filter/YearSelect.tsx components/ui/Sidebar.tsx
git commit -m "feat(year-filter): render year dropdown next to the sidebar brand"
```

---

## Task 5: Scope „Vydané" (invoices) to the selected year

**Files:**
- Modify: `components/invoice/InvoiceListClient.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { cn } from "@/lib/utils"` line, add:
```tsx
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { invoiceYear } from "@/lib/year-filter"
```

- [ ] **Step 2: Derive `yearInvoices` and drop the hardcoded `currentYear`**

Inside `InvoiceListClient`, just after the `const [status, setStatus] = useState<...>("all")` line, add:
```tsx
  const { year } = useYearFilter()
  const yearInvoices = invoices.filter((inv) => invoiceYear(inv) === year)
```

Then **delete** the old `currentYear` line and the year-string filters. Replace this block:
```tsx
  const currentYear = new Date().getFullYear()

  const yearCzk = invoices
    .filter((inv) => inv.currency === "CZK" && inv.issue_date.startsWith(String(currentYear)))
    .reduce((sum, inv) => sum + inv.total, 0)

  const yearEur = invoices
    .filter((inv) => inv.currency === "EUR" && inv.issue_date.startsWith(String(currentYear)))
    .reduce((sum, inv) => sum + inv.total, 0)

  const unpaidInvoices = invoices.filter((inv) => !inv.paid_at)
```
with (stats now derive from `yearInvoices`):
```tsx
  const yearCzk = yearInvoices
    .filter((inv) => inv.currency === "CZK")
    .reduce((sum, inv) => sum + inv.total, 0)

  const yearEur = yearInvoices
    .filter((inv) => inv.currency === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0)

  const unpaidInvoices = yearInvoices.filter((inv) => !inv.paid_at)
```

- [ ] **Step 3: Point overdue + filtered + export at `yearInvoices`**

Replace:
```tsx
  const overdueInvoices = invoices.filter((inv) => !inv.paid_at && isPastDue(inv.due_date))
```
with:
```tsx
  const overdueInvoices = yearInvoices.filter((inv) => !inv.paid_at && isPastDue(inv.due_date))
```

Replace:
```tsx
  const filtered = invoices.filter((inv) => {
    if (status === "unpaid") return !inv.paid_at
    if (status === "paid") return !!inv.paid_at
    return true
  })
```
with:
```tsx
  const filtered = yearInvoices.filter((inv) => {
    if (status === "unpaid") return !inv.paid_at
    if (status === "paid") return !!inv.paid_at
    return true
  })
```

In `handleExportAll`, replace `invoices` with `yearInvoices` (guard + export call):
```tsx
  async function handleExportAll() {
    if (!config || yearInvoices.length === 0) return
    setExportProgress({ done: 0, total: yearInvoices.length })
    try {
      await exportAllToPDF(yearInvoices, config, (done, total) => setExportProgress({ done, total }))
    } finally {
      setExportProgress(null)
    }
  }
```

- [ ] **Step 4: Year-scope the empty state and header count**

Replace the empty-state guard block:
```tsx
  if (invoices.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
          <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
            0
          </span>
        </div>
```
with (only the guard condition changes — from `invoices.length` to `yearInvoices.length`):
```tsx
  if (yearInvoices.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2.5 mb-8">
          <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
          <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
            0
          </span>
        </div>
```

Within that same empty-state return, replace the non-error branch (the `📄` block) so it distinguishes "no invoices in this year" from "no invoices at all". Replace:
```tsx
        ) : (
          <div className="bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl">📄</span>
            <p className="text-sm text-text-secondary">Zatím žádné faktury</p>
            <Button asChild className="mt-1">
              <a href="/invoice/new">Vytvořit první fakturu</a>
            </Button>
          </div>
        )}
```
with:
```tsx
        ) : invoices.length === 0 ? (
          <div className="bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl">📄</span>
            <p className="text-sm text-text-secondary">Zatím žádné faktury</p>
            <Button asChild className="mt-1">
              <a href="/invoice/new">Vytvořit první fakturu</a>
            </Button>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl">📄</span>
            <p className="text-sm text-text-secondary">Žádné faktury v roce {year}</p>
          </div>
        )}
```

Now update the **main (non-empty) header count** and the stat-card labels. Replace:
```tsx
        <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
        <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
          {invoices.length}
        </span>
```
with (count reflects the year):
```tsx
        <h1 className="text-2xl font-bold text-text">Vydané faktury</h1>
        <span className="inline-flex items-center rounded-full bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary tabular-nums">
          {yearInvoices.length}
        </span>
```

Replace the two stat-card labels that used `currentYear`:
```tsx
        <StatCard label={`Fakturace ${currentYear} — CZK`} value={`${fmtNum(yearCzk)} Kč`} />
        <StatCard
          label={`Fakturace ${currentYear} — €`}
          value={yearEur > 0 ? `${fmtNum(yearEur)} €` : "—"}
        />
```
with:
```tsx
        <StatCard label={`Fakturace ${year} — CZK`} value={`${fmtNum(yearCzk)} Kč`} />
        <StatCard
          label={`Fakturace ${year} — €`}
          value={yearEur > 0 ? `${fmtNum(yearEur)} €` : "—"}
        />
```

Finally, update the Export button `disabled` guard. Replace:
```tsx
          disabled={!!exportProgress || invoices.length === 0 || !config}
```
with:
```tsx
          disabled={!!exportProgress || yearInvoices.length === 0 || !config}
```

- [ ] **Step 5: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors. (Biome will flag an unused `currentYear` if any reference was missed — fix by removing the stray usage.)

- [ ] **Step 6: Browser verification**

- Reload `/`. Confirm the count badge, stat cards („Fakturace {rok}"), and table all reflect the selected year.
- Switch the year in the sidebar dropdown → the list, counts, and stat cards update instantly (no reload).
- Select a year with no invoices → empty state „Žádné faktury v roce {rok}"; a truly empty DB still shows „Zatím žádné faktury" + CTA.
- Click „Export ZIP" for a year → only that year's invoices are generated (watch the `Generuji x / y` counter).

- [ ] **Step 7: Commit**

```bash
git add components/invoice/InvoiceListClient.tsx
git commit -m "feat(year-filter): scope Vydané list, stats and export to selected year"
```

---

## Task 6: Scope „Přijaté" (costs) to the selected year

**Files:**
- Modify: `components/costs/CostListClient.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { cn } from "@/lib/utils"` line, add:
```tsx
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
import { costYear } from "@/lib/year-filter"
```

- [ ] **Step 2: Replace the hardcoded current year with the context year**

Replace:
```tsx
  const [status, setStatus] = useState<StatusFilter>("all")
  // Přijaté faktury vždy zobrazují jen aktuální rok.
  const currentYear = String(new Date().getFullYear())
```
with:
```tsx
  const [status, setStatus] = useState<StatusFilter>("all")
  const { year } = useYearFilter()
```

- [ ] **Step 3: Year-scope the dataset, filter, and stats**

Replace the `filtered` memo:
```tsx
  const filtered = useMemo(
    () =>
      costs
        .filter((c) => {
          if (status === "unpaid" && c.paid_at) return false
          if (status === "paid" && !c.paid_at) return false
          if (!c.issue_date.startsWith(currentYear)) return false
          return true
        })
        // Řazení podle data přijetí, nejnovější první; bez data na konec.
        .sort((a, b) => {
          if (!a.received_date) return 1
          if (!b.received_date) return -1
          return b.received_date.localeCompare(a.received_date)
        }),
    [costs, status, currentYear]
  )

  const unpaid = costs.filter((c) => !c.paid_at)
  const overdue = unpaid.filter((c) => isPastDue(c.due_date))
```
with (introduce `yearCosts`; both the table filter and the stat cards derive from it):
```tsx
  const yearCosts = useMemo(() => costs.filter((c) => costYear(c) === year), [costs, year])

  const filtered = useMemo(
    () =>
      yearCosts
        .filter((c) => {
          if (status === "unpaid" && c.paid_at) return false
          if (status === "paid" && !c.paid_at) return false
          return true
        })
        // Řazení podle data přijetí, nejnovější první; bez data na konec.
        .sort((a, b) => {
          if (!a.received_date) return 1
          if (!b.received_date) return -1
          return b.received_date.localeCompare(a.received_date)
        }),
    [yearCosts, status]
  )

  const unpaid = yearCosts.filter((c) => !c.paid_at)
  const overdue = unpaid.filter((c) => isPastDue(c.due_date))
```

- [ ] **Step 4: Point the stat card and export at the year**

Replace the „Náklady celkem" stat card:
```tsx
        <StatCard label="Náklady celkem" value={sumByCurrency(costs)} />
```
with:
```tsx
        <StatCard label="Náklady celkem" value={sumByCurrency(yearCosts)} />
```

In `handleExportZip`, replace:
```tsx
      const { base64, filename, error } = await exportCostsZip(currentYear)
```
with:
```tsx
      const { base64, filename, error } = await exportCostsZip(String(year))
```

- [ ] **Step 5: Year-scope the empty-state copy**

The empty state currently reads `costs.length === 0 ? "Zatím žádné náklady" : "Žádné náklady neodpovídají filtru"`. Replace that ternary:
```tsx
            {costs.length === 0 ? "Zatím žádné náklady" : "Žádné náklady neodpovídají filtru"}
```
with (distinguishes empty DB vs. empty year vs. status filter):
```tsx
            {costs.length === 0
              ? "Zatím žádné náklady"
              : yearCosts.length === 0
                ? `Žádné náklady v roce ${year}`
                : "Žádné náklady neodpovídají filtru"}
```

- [ ] **Step 6: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors (no remaining references to `currentYear`).

- [ ] **Step 7: Browser verification**

- Open `/costs`. Confirm the table, „Náklady celkem"/„Nezaplaceno"/„Po splatnosti" cards, and the count badge reflect the selected year.
- Switch the year → costs update instantly.
- Confirm a cost with empty `issue_date` but a `received_date` in the selected year appears (fallback works).
- „Export ZIP" downloads `naklady-prilohy-<rok>.zip` containing only that year's attachments.

- [ ] **Step 8: Commit**

```bash
git add components/costs/CostListClient.tsx
git commit -m "feat(year-filter): scope Přijaté list, stats and export to selected year"
```

---

## Task 7: Unify `exportCostsZip` period matching with `costYear`

**Files:**
- Modify: `lib/costs.ts` (add import; rewrite `inPeriod`)

- [ ] **Step 1: Import `costYear`**

Add near the top imports of `lib/costs.ts` (after the `@/lib/...` imports):
```ts
import { costYear } from "@/lib/year-filter"
```

- [ ] **Step 2: Rewrite `inPeriod` to match the on-screen year logic**

Replace:
```ts
function inPeriod(cost: Cost, period: string): boolean {
  if (!period) return true
  return cost.issue_date.startsWith(period)
}
```
with (period is a 4-digit year string; empty = all years):
```ts
function inPeriod(cost: Cost, period: string): boolean {
  if (!period) return true
  const y = costYear(cost)
  return y !== null && String(y) === period
}
```

- [ ] **Step 3: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Browser verification**

- On `/costs`, upload/confirm a cost that has only a `received_date` (no `issue_date`) in the selected year, then „Export ZIP" — it must now be included (previously it was skipped because `issue_date` was empty).

- [ ] **Step 5: Commit**

```bash
git add lib/costs.ts
git commit -m "fix(costs): export ZIP year uses issue_date with received_date fallback"
```

---

## Task 8: Scope „Souhrnné hlášení" months to the selected year

**Files:**
- Modify: `components/vat-recapitulative-statement/VatRecapStatementClient.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { cn } from "@/lib/utils"` line, add:
```tsx
import { useYearFilter } from "@/components/year-filter/YearFilterProvider"
```

- [ ] **Step 2: Filter months by the selected year**

Inside `VatRecapStatementClient`, just after `const [exporting, setExporting] = useState<string | null>(null)`, add:
```tsx
  const { year } = useYearFilter()
  const visibleMonths = months.filter((m) => m.rok === year)
```

- [ ] **Step 3: Render `visibleMonths` and add a year-scoped empty state**

Replace the opening of the render map:
```tsx
  return (
    <div className="space-y-3">
      {months.map(({ rok, mesic, data, received, error }) => {
```
with (empty state when the selected year has no months; otherwise iterate `visibleMonths`):
```tsx
  if (visibleMonths.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-secondary shadow-card">
        Žádné měsíce s povinností hlášení v roce {year}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visibleMonths.map(({ rok, mesic, data, received, error }) => {
```

(The `configMissing` early-return block above stays as-is and still takes precedence.)

- [ ] **Step 4: Lint + typecheck**

Run:
```bash
pnpm lint && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Browser verification**

- Open `/vat-recapitulative-statement`. Only months of the selected year are listed.
- Switch the year in the sidebar → the month list updates instantly.
- Select a year with no reporting obligation → the „Žádné měsíce…" empty state shows.

- [ ] **Step 6: Commit**

```bash
git add components/vat-recapitulative-statement/VatRecapStatementClient.tsx
git commit -m "feat(year-filter): scope Souhrnné hlášení months to selected year"
```

---

## Task 9: Full-build verification + persistence check

**Files:** none (verification only)

- [ ] **Step 1: Full production build (lint + typecheck + build)**

Run:
```bash
pnpm build
```
Expected: `biome lint .` passes and `next build` completes with no type errors.

- [ ] **Step 2: End-to-end browser walkthrough**

With the dev server running (port 3030):
- On `/`, `/costs`, and `/vat-recapitulative-statement`, switching the year updates each view without a manual reload.
- Reload the page after choosing a non-default year → the selection persists (cookie `year-filter`). Verify via `read_network_requests` or DevTools that the request carries `year-filter=<rok>` and the server renders the correct initial year (no hydration warning in `read_console_messages`).
- Visit `/customers`, `/suppliers`, `/settings` → the dropdown is visible but changing it causes no visible change (expected; those pages are year-agnostic).
- `read_console_messages` (onlyErrors): clean.

- [ ] **Step 3: Confirm no unrelated files were committed**

Run:
```bash
git status
```
Expected: the OOM-probe changes (`lib/actions.ts` had only the year addition committed; `instrumentation.ts`, `lib/mem-probe.ts`) remain as they were before Task 0 — none of the probe-only edits were staged. Only year-filter changes are in the branch's commits.

---

## Self-Review (completed during authoring)

- **Spec coverage:** dropdown placement (Task 4), date basis incl. cost fallback (Tasks 1, 6, 7), available-years + current-year default (Tasks 1, 3), Vydané/Přijaté/Souhrnné hlášení scoping (Tasks 5, 6, 8), contacts/settings unaffected (dropdown lives in sidebar, no consumer there — verified Task 9 Step 2), cookie persistence + SSR-consistent initial year (Tasks 2, 3, 9). All covered.
- **Placeholders:** none — every code step shows full code.
- **Type consistency:** `YEAR_COOKIE`, `yearFromDate`, `invoiceYear`, `costYear`, `resolveInitialYear`, `getAvailableYears`, `useYearFilter`, `YearFilterProvider`, `YearSelect` are named identically across all tasks; types imported from `@/types` (barrel over `lib/schemas`).
