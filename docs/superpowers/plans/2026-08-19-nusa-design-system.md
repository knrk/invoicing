# Nusa Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the invoicing app to the Nusa Bay visual language — forest-green accent, warm cream background, rounder cards, pill buttons, soft layered shadows, sectioned sidebar — driven almost entirely from the token layer so it cascades to every page.

**Architecture:** All styling flows from semantic tokens in `app/globals.css` (`@theme inline`, `light-dark()`), consumed by components via Tailwind utility classes (`bg-primary`, `bg-surface`, `rounded-lg`, `shadow-card`). We rewrite token *values*, override the Tailwind radius scale so existing `rounded-*` classes get rounder, update four primitives (button, card, input family, badge), restructure the sidebar, then apply the reference's tab + right-rail layout to the settings page as the showcase. PDF/print styles are explicitly untouched.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, shadcn-style primitives, Radix, Biome (lint), Montserrat/Roboto fonts.

**Verification note:** This is a visual/CSS change; the repo has no unit-test framework (only `biome lint`). "Verify" steps therefore mean: `pnpm lint` passes, the dev server compiles clean, and browser screenshots (light + dark) confirm the intended look. The user cannot judge the palette from text, so screenshots are the acceptance gate.

**Global constraint — DO NOT TOUCH:**
- `app/globals.css` lines under `.invoice-a4` and `@media print`.
- `components/invoice/InvoicePreview.tsx`, `components/invoice/InvoicePreview.module.css`, `components/costs/pdf-file.ts` — these render the generated PDF/printed invoice and must stay visually identical.
- `components/costs/CostFilePreview.tsx` `bg-white` frame (line ~79) — intentional white document viewport; leave it.

---

## File Structure

Files created or modified:

- **Modify** `app/globals.css` — rewrite the `@theme inline` token block (colors, radius scale, shadows). The largest single change; everything cascades from here.
- **Modify** `components/ui/button.tsx` — pill radius + palette-tuned variants.
- **Modify** `components/ui/card.tsx` — radius, layered shadow, lighter header divider.
- **Modify** `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx` — 12px radius, green focus ring (most already inherit via tokens; verify + adjust).
- **Modify** `components/ui/badge.tsx` — retune `orange` status variant to warning tokens.
- **Modify** `components/invoice/InvoiceForm.tsx` — remove `bg-white` overrides (dark-mode bug), fix `hover:text-orange-600`.
- **Modify** `components/ui/Sidebar.tsx` — grouped sections + green active pill.
- **Create** `components/ui/Tabs.tsx` — reusable segmented pill-tab control.
- **Modify** `components/invoice/SettingsForm.tsx` + `app/settings/page.tsx` — apply pill-tabs + right-rail layout (the reference-page showcase).

---

## Phase 1 — Token foundation

### Task 1: Rewrite the token layer

**Files:**
- Modify: `app/globals.css:4-53` (the `@theme inline` block only)

- [ ] **Step 1: Replace the `@theme inline` block**

Replace the entire block from `@theme inline {` (line 4) through its closing `}` (line 53) with the following. Leave everything after line 53 (`:root`, `body`, `.invoice-a4`, `@media print`) unchanged.

```css
@theme inline {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-heading: "Montserrat", sans-serif;
  --font-body: "Roboto", sans-serif;
  --font-mono: monospace;

  /* --- Semantic surfaces & text --- */
  --color-page: light-dark(#efefed, #0f1311);
  --color-surface: light-dark(#ffffff, #171c19);
  --color-subtle: light-dark(#f3f3f0, #1e2521);
  --color-border: light-dark(#e6e6e1, #2a322d);
  --color-divider: light-dark(#eeeeea, #232a26);
  --color-text: light-dark(#1b1f1e, #e8eae7);
  --color-text-secondary: light-dark(#6b726e, #9aa39e);
  --color-muted: light-dark(#9aa09d, #727b76);
  --color-accent: light-dark(#2e3d39, #5b7a6c);
  --color-accent-hover: light-dark(#26322e, #6c8c7d);
  --color-warning-bg: light-dark(#fbf6ec, #2a2416);
  --color-warning-border: light-dark(#ecd9b0, #4d4326);
  --color-warning-text: light-dark(#8a6d2f, #e6cf9a);
  --color-danger: light-dark(#c0392b, #e2726a);

  /* --- shadcn-compatible aliases --- */
  --color-background: light-dark(#ffffff, #171c19);
  --color-foreground: light-dark(#1b1f1e, #e8eae7);
  --color-card: light-dark(#ffffff, #171c19);
  --color-card-foreground: light-dark(#1b1f1e, #e8eae7);
  --color-popover: light-dark(#ffffff, #1e2521);
  --color-popover-foreground: light-dark(#1b1f1e, #e8eae7);
  --color-primary: light-dark(#2e3d39, #5b7a6c);
  --color-primary-foreground: light-dark(#ffffff, #ffffff);
  --color-secondary: light-dark(#f3f3f0, #1e2521);
  --color-secondary-foreground: light-dark(#1b1f1e, #e8eae7);
  --color-muted-bg: light-dark(#f3f3f0, #1e2521);
  --color-muted-fg: light-dark(#6b726e, #9aa39e);
  --color-accent-bg: light-dark(#eef2f0, #1e2521);
  --color-accent-fg: light-dark(#1b1f1e, #caded2);
  --color-destructive: light-dark(#c0392b, #e2726a);
  --color-destructive-foreground: light-dark(#ffffff, #ffffff);
  --color-input: light-dark(#e6e6e1, #2a322d);
  --color-ring: light-dark(#2e3d39, #5b7a6c);

  /* --- Radii: override Tailwind scale so rounded-* cascade --- */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-2xl: 26px;
  --radius-input: 12px;
  --radius-card: 20px;
  --radius-panel: 26px;
  --radius: 0.75rem;

  /* --- Shadows: soft layered lift --- */
  --shadow-card: 0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -16px rgba(16, 24, 40, 0.12);
  --shadow-preview: 0 4px 16px -6px rgba(16, 24, 40, 0.12), 0 2px 6px rgba(16, 24, 40, 0.05);
  --shadow-elevated: 0 12px 32px -12px rgba(16, 24, 40, 0.18), 0 4px 10px rgba(16, 24, 40, 0.06);
}
```

- [ ] **Step 2: Verify lint + compile**

Run:
```bash
pnpm lint
```
Expected: no new errors.

- [ ] **Step 3: Start dev server and screenshot both themes**

Start the dev server (browser preview): `preview_start { name: "dev" }` (create `.claude/launch.json` with `{ "name": "dev", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "port": 3030 }` if it does not exist), navigate to `http://localhost:3030/`.
Capture: screenshot in light mode, then toggle dark mode (sidebar toggle) and screenshot again.
Expected: cream background, green accents, no orange remaining. Rounded cards. Dark mode = green-black, legible.

- [ ] **Step 4: Confirm `rounded-*` cascade worked**

In the browser, run `javascript_tool`: read `getComputedStyle` `borderRadius` of a `.rounded-xl` card.
Expected: `20px` (proves the Tailwind radius override took effect). If it is still `12px`/`0.75rem`, the `--radius-xl` override did not apply — fall back to editing card/button classes directly and note it.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): forest-green token palette, rounder radii, soft shadows"
```

---

## Phase 2 — Primitives

### Task 2: Button → pill shape + tuned variants

**Files:**
- Modify: `components/ui/button.tsx:6-38`

- [ ] **Step 1: Update `buttonVariants`**

Change the base class `rounded-lg` → `rounded-full`, and retune variants. Replace the `cva(...)` call (lines 6-38) with:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-accent-hover active:bg-accent-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90",
        outline:
          "border border-border bg-surface text-text hover:bg-subtle",
        secondary:
          "bg-subtle text-text hover:bg-border",
        ghost:
          "text-text-secondary hover:bg-subtle hover:text-text",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto font-medium",
        dark:
          "bg-foreground text-background hover:opacity-90 active:opacity-80",
      },
      size: {
        default: "h-9 px-5 py-2.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

Note: `link` keeps its own layout; `rounded-full` on it is harmless. `icon` size stays square-ish but becomes circular — acceptable and matches the reference's round icon buttons.

- [ ] **Step 2: Verify**

Run `pnpm lint`. Reload the browser, screenshot a page with buttons (e.g. `/` invoice list, `/invoice/new`).
Expected: pill-shaped dark-green primary buttons; outline/ghost read correctly in both themes.

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx
git commit -m "feat(design): pill-shaped buttons on new palette"
```

### Task 3: Card → radius + layered shadow + lighter divider

**Files:**
- Modify: `components/ui/card.tsx:9` and `:22`

- [ ] **Step 1: Update Card base class**

Line 9 — change `rounded-xl border border-border shadow-card` stays but confirm radius: `rounded-xl` now resolves to 20px via the token override, so no class change needed there. Change the header divider (line 22) from `border-b border-border` to `border-b border-divider` for a softer inner line:

```tsx
// line 22
    className={cn("px-6 pt-6 pb-4 border-b border-divider", className)}
```

(Card base on line 9 stays `"bg-surface rounded-xl border border-border shadow-card"` — the token changes already give it 20px + the new soft shadow.)

- [ ] **Step 2: Verify**

Reload, screenshot a card-heavy page (`/settings`).
Expected: 20px-rounded white cards, soft layered shadow, faint header divider.

- [ ] **Step 3: Commit**

```bash
git add components/ui/card.tsx
git commit -m "feat(design): softer card divider on new radius/shadow tokens"
```

### Task 4: Input / Select / Textarea → radius + green focus

**Files:**
- Modify: `components/ui/input.tsx:14-17`
- Verify: `components/ui/select.tsx`, `components/ui/textarea.tsx`

- [ ] **Step 1: Update Input radius**

In `input.tsx` line 14, `rounded-lg` now resolves to 12px via tokens — no change needed for radius. Confirm the focus ring already uses `focus:border-primary focus:ring-2 focus:ring-primary/20` (it does). No edit required unless Step 2 shows a mismatch.

- [ ] **Step 2: Verify select & textarea inherit tokens**

Open `components/ui/select.tsx` and `components/ui/textarea.tsx`. Confirm they use `rounded-lg`/`rounded-md`, `border-border`, `bg-surface`, `focus:*-primary`. If any uses a hardcoded color or `rounded` literal that clashes, change it to the matching token class. Record exact edits made.

- [ ] **Step 3: Verify in browser**

Reload `/invoice/new`, focus an input and a select.
Expected: 12px radius, green focus ring in both themes.

- [ ] **Step 4: Commit**

```bash
git add components/ui/input.tsx components/ui/select.tsx components/ui/textarea.tsx
git commit -m "feat(design): input family radius + green focus on new tokens"
```

### Task 5: Badge retune + hardcoded-value sweep

**Files:**
- Modify: `components/ui/badge.tsx:13`
- Modify: `components/invoice/InvoiceForm.tsx:544` and the five `className="bg-white"` inputs (lines ~464, 473, 486, 494, 510)

- [ ] **Step 1: Retune the `orange` badge variant**

`badge.tsx` line 13 — replace the orange status variant with warning tokens so it harmonizes:

```tsx
        orange: "bg-warning-bg text-warning-text border border-warning-border",
```

(Leave `blue`/`green`/`red` as-is — they are functional status colors, not brand accent.)

- [ ] **Step 2: Fix the stale orange link hover in InvoiceForm**

`InvoiceForm.tsx` line 544 — change `hover:text-orange-600` to `hover:text-accent-hover`:

```tsx
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-accent-hover transition-colors"
```

- [ ] **Step 3: Remove `bg-white` overrides on line-item inputs (dark-mode bug)**

In `InvoiceForm.tsx`, the five line-item `<Input>`s carry `className="bg-white"`, which forces white in dark mode. The `Input` primitive already applies `bg-surface`, so delete the `className="bg-white"` attribute on each of those five inputs (around lines 464, 473, 486, 494, 510). For inputs where `bg-white` is the only class, remove the whole `className="bg-white"` prop.

- [ ] **Step 4: Re-scan for stragglers**

Run:
```bash
grep -rEn "orange-[0-9]|#f97316|#ea6c0a|bg-white|text-black" app components | grep -v node_modules | grep -viE "InvoicePreview|pdf-file|CostFilePreview|\.module\.css"
```
Expected: no results (all remaining `bg-white`/`text-black` are inside the PDF/print files we intentionally skip). If anything else appears, route it to the matching token class and record it.

- [ ] **Step 5: Verify**

Run `pnpm lint`. Reload `/invoice/new` in dark mode, confirm line-item inputs use the dark surface (not white).

- [ ] **Step 6: Commit**

```bash
git add components/ui/badge.tsx components/invoice/InvoiceForm.tsx
git commit -m "feat(design): retune badge + remove hardcoded orange/white overrides"
```

---

## Phase 3 — Sidebar

### Task 6: Sectioned sidebar + green active state

**Files:**
- Modify: `components/ui/Sidebar.tsx`

- [ ] **Step 1: Introduce grouped nav sections**

Replace the flat `NAV_ITEMS` array (lines 12-18) with grouped sections:

```tsx
const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: typeof FileText }[] }[] = [
  {
    label: "Hlavní",
    items: [
      { href: "/",      label: "Vydané",  icon: FileText },
      { href: "/costs", label: "Přijaté", icon: Receipt  },
    ],
  },
  {
    label: "Přehledy",
    items: [
      { href: "/vat-recapitulative-statement", label: "Souhrnné hlášení", icon: BadgeEuro },
    ],
  },
  {
    label: "Kontakty",
    items: [
      { href: "/customers", label: "Odběratelé", icon: Contact },
      { href: "/suppliers", label: "Dodavatelé", icon: Truck   },
    ],
  },
]
```

Keep `BOTTOM_ITEMS` (Nastavení) as-is.

- [ ] **Step 2: Render grouped sections with muted labels**

Replace the `<nav>` body (lines 144-175) so it maps over `NAV_SECTIONS`, rendering a muted uppercase section label before each group (hidden when collapsed), and the green active pill for the active item:

```tsx
      <nav className={cn("flex-1 py-2 overflow-y-auto overflow-x-hidden", collapsed ? "px-2" : "px-3")}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted uppercase tracking-[0.12em] px-2 mb-1">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = path === href
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "flex items-center rounded-xl text-sm transition-colors",
                        collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                        active
                          ? "bg-primary text-primary-foreground font-semibold shadow-[0_6px_16px_-8px_var(--color-primary)]"
                          : "text-text-secondary hover:bg-subtle hover:text-text"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary-foreground" : "")} />
                      {!collapsed && (
                        <span className="whitespace-nowrap overflow-hidden">{label}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
```

- [ ] **Step 3: Apply the same green active pill to the bottom items**

In the `BOTTOM_ITEMS` map (lines 181-202), change the active branch from `"bg-subtle text-text font-semibold"` to match the nav pill, and the icon/rounded to `rounded-xl`:

```tsx
              className={cn(
                "flex items-center rounded-xl text-sm transition-colors",
                collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
                active
                  ? "bg-primary text-primary-foreground font-semibold shadow-[0_6px_16px_-8px_var(--color-primary)]"
                  : "text-text-secondary hover:bg-subtle hover:text-text"
              )}
```
and the icon line: `<Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary-foreground" : "")} />`.

- [ ] **Step 4: Verify**

Run `pnpm lint`. Reload, navigate between pages.
Expected: three labeled sections, active item is a filled dark-green pill with a soft green shadow; collapsed mode still works (labels hidden, icons centered).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Sidebar.tsx
git commit -m "feat(design): sectioned sidebar with forest-green active state"
```

---

## Phase 4 — Layout showcase: settings page (pill tabs + right rail)

This applies the exact structure of the reference URL (`/dashboard/settings`) to our settings page: a segmented pill-tab header and a right-rail info card beside the main form.

### Task 7: Reusable segmented pill-tab component

**Files:**
- Create: `components/ui/Tabs.tsx`

- [ ] **Step 1: Create the Tabs component**

```tsx
"use client"

import { cn } from "@/lib/utils"

export interface TabItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-subtle p-1",
        className
      )}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = id === value
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-text-secondary hover:text-text"
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify lint**

Run `pnpm lint`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Tabs.tsx
git commit -m "feat(design): reusable segmented pill-tab component"
```

### Task 8: Apply tabs + right rail to the settings page

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `components/invoice/SettingsForm.tsx`

- [ ] **Step 1: Widen the settings layout to two columns**

In `app/settings/page.tsx`, change the `<main>` wrapper (line 10) from the narrow centered column to a wider two-column shell, and give the page the reference's larger title:

```tsx
    <main className="max-w-5xl mx-auto px-10 py-8">
      <h1 className="text-[28px] font-bold text-text tracking-tight mb-6">Nastavení</h1>
      <SettingsForm config={config}>
        <Suspense>
          <GmailIntegrationSettings status={gmailStatus} />
        </Suspense>
      </SettingsForm>
    </main>
```

- [ ] **Step 2: Add tab state + right rail inside SettingsForm**

`SettingsForm.tsx` groups its fields into logical sections. Introduce a `Tabs` header that switches which section-card is shown, and a right-rail summary card. Concretely:

1. Import the Tabs component and an icon set at the top of `SettingsForm.tsx`:
```tsx
import { Tabs, type TabItem } from "@/components/ui/Tabs"
import { Building2, Landmark, FileText, Receipt } from "lucide-react"
```
2. Define the tab items and state near the top of the component body (after existing `useState`):
```tsx
const TAB_ITEMS: TabItem[] = [
  { id: "supplier", label: "Dodavatel", icon: Building2 },
  { id: "banking",  label: "Bankovnictví", icon: Landmark },
  { id: "invoice",  label: "Faktura", icon: FileText },
  { id: "footer",   label: "Patička", icon: Receipt },
]
const [tab, setTab] = useState("supplier")
```
3. Wrap the existing content in a two-column grid: left column = the `Tabs` header plus the currently-selected section's `Card`(s); right column = a summary `Card`. Render each existing field-group `Card` only when its tab is active (`{tab === "supplier" && ( ...existing supplier Card... )}`, etc.). The Gmail integration (`children`) stays under the `invoice` or a dedicated tab — keep it in whichever section it currently sits closest to; if unsure, place it after the `invoice` section card.

The wrapper structure:
```tsx
<form onSubmit={handleSubmit}>
  <div className="flex items-start gap-6">
    <div className="flex-1 min-w-0 space-y-4">
      <Tabs items={TAB_ITEMS} value={tab} onValueChange={setTab} className="mb-2" />
      {tab === "supplier" && (/* existing supplier Card */)}
      {tab === "banking"  && (/* existing banking Card */)}
      {tab === "invoice"  && (/* existing invoice-defaults Card + {children} */)}
      {tab === "footer"   && (/* existing footer/notes Card */)}
      {/* keep the Save button here, below the active section */}
    </div>
    <aside className="w-72 shrink-0 space-y-4">
      <Card>
        <CardHeader><CardTitle>Přehled</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-text-secondary">Dodavatel</span><span className="font-medium text-text">{form.supplier.name || "—"}</span></div>
          <div className="flex justify-between"><span className="text-text-secondary">IČO</span><span className="font-medium text-text">{form.supplier.ico || "—"}</span></div>
          <div className="flex justify-between"><span className="text-text-secondary">Účet CZK</span><span className="font-medium text-text">{form.banking.account_czk || "—"}</span></div>
        </CardContent>
      </Card>
    </aside>
  </div>
</form>
```

Adapt the exact JSX to the file's current structure — the key requirement is: existing field groups become tab-switched, wrapped in the two-column grid, with the summary aside on the right. Do not remove any existing form fields or the save logic.

- [ ] **Step 3: Verify**

Run `pnpm lint`. Reload `/settings`.
Expected: pill-tab header switches sections; right-rail summary shows live supplier/IČO/account values; saving still works (test the Save button, confirm the toast fires and values persist on reload).

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx components/invoice/SettingsForm.tsx
git commit -m "feat(design): settings page adopts pill-tabs + right-rail layout"
```

---

## Phase 5 — Full visual QA & dark-mode tuning

### Task 9: Cross-page verification and palette tuning

**Files:**
- Possibly re-touch: `app/globals.css` (dark palette only)

- [ ] **Step 1: Screenshot every top-level page, both themes**

With the dev server running, capture light + dark screenshots of: `/` (invoice list), `/invoice/new` (form), `/costs` (received invoices table), `/customers`, `/suppliers`, `/vat-recapitulative-statement`, `/settings`. Use the browser preview tools.

- [ ] **Step 2: Check for regressions**

For each page verify: no orange remnants; text contrast is legible in dark mode (especially green accent on dark surfaces and white-on-green buttons); tables/cards don't look wrong with the rounder radius; focus rings are green; the invoice PDF preview (`/invoice/new` right side) is UNCHANGED.

- [ ] **Step 3: Tune the dark forest palette if needed**

If dark-mode accent/text contrast looks weak in screenshots, adjust only the dark values in the `light-dark(...)` pairs in `app/globals.css` (e.g. lighten `--color-primary` dark side toward `#6c8c7d`, or raise `--color-text-secondary`). Re-screenshot until legible. Record any values changed.

- [ ] **Step 4: Final lint + build check**

Run:
```bash
pnpm lint && pnpm build
```
Expected: both succeed. (Note: dev server has a known long-run OOM per project memory — a one-off `build` is fine.)

- [ ] **Step 5: Show the user before/after screenshots and get sign-off**

Send the user light + dark screenshots of the key pages via `SendUserFile`. This is the acceptance gate — the user validates the palette visually here.

- [ ] **Step 6: Commit any tuning**

```bash
git add app/globals.css
git commit -m "fix(design): tune dark forest palette for contrast"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** tokens (Task 1), primitives button/card/input/badge (Tasks 2–5), sectioned sidebar (Task 6), pill-tabs + right-rail via settings showcase (Tasks 7–8), dark-green variant + visual verification (Tasks 1,9), PDF/print untouched (global constraint, re-checked in Task 5 grep and Task 9 step 2). Fonts unchanged per decision (no task needed). All spec sections mapped.
- **Placeholder scan:** all code steps contain literal code; the only "adapt to current structure" latitude is Task 8 Step 2, which is unavoidable for a layout refactor and is bounded by an explicit invariant (no fields/logic removed).
- **Type consistency:** `TabItem`/`Tabs` props defined in Task 7 are consumed exactly in Task 8; `NAV_SECTIONS` shape defined and consumed within Task 6.
