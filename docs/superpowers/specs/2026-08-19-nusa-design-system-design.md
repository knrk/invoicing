# Design: "Nusa" Design System

**Date:** 2026-08-19
**Status:** Approved (direction), pending spec review
**Goal:** Re-skin the invoicing app to match the visual language of the Nusa Bay
dashboard template (`https://nusa-bay-host.netlify.app/dashboard/settings`):
forest-green accent, warm cream background, very rounded cards, pill-shaped
buttons, soft layered shadows, and a sectioned sidebar.

## Decisions (from brainstorming)

1. **Scope:** Re-theme (tokens + primitives) **plus** adopt the reference's
   layout patterns (pill tab groups, right-rail summary cards, sectioned
   sidebar) where they naturally fit. Not a full per-page rebuild.
2. **Dark mode:** Keep the existing dark-mode infrastructure
   (`data-theme`, `light-dark()`); derive a dark forest-green palette.
3. **Typography:** Keep current Montserrat (headings) / Roboto (body) fonts.
   Only color, shape, spacing, and shadows change.

## Reference design language (extracted from the live template)

| Aspect | Value observed |
|---|---|
| Page background | `#efefed` (warm cream) |
| Card surface | `#ffffff` |
| Primary text | `#1b1f1e` (green-black) |
| Muted text | `#9aa09d` |
| Accent (buttons, active nav, active tab) | `#2e3d39` (forest green) |
| Card radius | ~26px |
| Input radius | 12px |
| Nav item radius | 12px |
| Buttons / tabs | fully rounded (pill) |
| Card shadow | `0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.12)` |
| Section labels | 10.5px, weight 600, uppercase, letter-spacing ~1.5px, muted |
| Active nav pill | green fill + soft green-tinted shadow, 12px radius |

## Architecture

The app already centralizes styling in a token layer, so the re-skin is
low-risk and cascades automatically:

- `app/globals.css` defines semantic tokens via `@theme inline`
  (`--color-page`, `--color-surface`, `--color-primary`, `--radius-*`,
  `--shadow-*`) using `light-dark()`.
- Components consume tokens through Tailwind utility classes
  (`bg-primary`, `bg-surface`, `border-border`, `text-text`, `rounded-lg`, …).

Therefore the bulk of the change is:
1. Rewrite token **values** in `globals.css` (colors, radii, shadows).
2. Update a handful of **primitives** (button, card, input, select, textarea).
3. Restructure the **sidebar** (grouped sections + green active state).
4. Apply **layout patterns** on the pages where they fit.
5. **Sweep** for hardcoded values that bypass tokens (literal orange, fixed
   radii) and route them through tokens.

## Token specification

### Light mode

| Token | New value | Role |
|---|---|---|
| `--color-page` | `#efefed` | app background (cream) |
| `--color-surface` | `#ffffff` | cards, sidebar |
| `--color-subtle` | `#f3f3f0` | hover / secondary fills |
| `--color-border` | `#e6e6e1` | card & control borders |
| `--color-divider` | `#eeeeea` | inner dividers |
| `--color-text` | `#1b1f1e` | primary text |
| `--color-text-secondary` | `#6b726e` | labels, descriptions |
| `--color-muted` | `#9aa09d` | section labels, stat captions |
| `--color-accent` / `--color-primary` | `#2e3d39` | forest green |
| `--color-accent-hover` | `#26322e` | darker green (hover/active) |
| `--color-primary-foreground` | `#ffffff` | text on green |
| `--color-warning-bg` / `-border` / `-text` | amber, re-tuned to harmonize | tax/VAT warnings |
| `--color-danger` / `--color-destructive` | `#c0392b` (muted red) | destructive |
| `--color-ring` | `#2e3d39` (with alpha for focus) | focus ring |

### Dark mode (forest variant — first pass, tuned visually in browser)

| Token | New value | Role |
|---|---|---|
| `--color-page` | `#0f1311` | deep green-black |
| `--color-surface` | `#171c19` | cards |
| `--color-subtle` | `#1e2521` | hover fills |
| `--color-border` | `#2a322d` | borders |
| `--color-divider` | `#232a26` | dividers |
| `--color-text` | `#e8eae7` | primary text |
| `--color-text-secondary` | `#9aa39e` | secondary text |
| `--color-muted` | `#727b76` | muted |
| `--color-primary` / `--color-accent` | `#5b7a6c` (lightened sage) | accent that reads on dark |
| `--color-accent-hover` | `#6c8c7d` | hover |
| `--color-primary-foreground` | `#ffffff` | text on accent |

### Radii & shadows

| Token | New value |
|---|---|
| `--radius-input` | `12px` |
| `--radius-card` | `20px` |
| `--radius-panel` | `26px` |
| `--radius` (shadcn base) | `0.75rem` |
| `--shadow-card` | `0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.12)` |
| `--shadow-preview` / `--shadow-elevated` | retuned softer to match |

Buttons and tab pills use `rounded-full` rather than a token radius.

## Primitive changes

- **Button** (`components/ui/button.tsx`): default variant → pill
  (`rounded-full`), dark-green background, white text, hover → `accent-hover`.
  Retune `outline`, `secondary`, `ghost`, `dark`, `destructive` to the new
  palette. Keep existing sizes.
- **Card** (`components/ui/card.tsx`): `rounded-xl` → card radius (20px),
  apply the soft layered `shadow-card`, lighten the header border to
  `divider`.
- **Input / Select / Textarea**: radius 12px, green focus ring
  (`focus:ring-primary/20`, `focus:border-primary`).
- **Badge / Switch / DatePicker / Tooltip / Dialog**: verify they read tokens;
  adjust any hardcoded radius/color to match.

## Layout patterns

Applied where they fit — not a forced per-page rebuild:

- **Sidebar** (`components/ui/Sidebar.tsx`): group nav into labeled sections
  with muted uppercase headers. Proposed grouping (Czech):
  - `HLAVNÍ` — Vydané, Přijaté
  - `PŘEHLEDY` — Souhrnné hlášení
  - `KONTAKTY` — Odběratelé, Dodavatelé
  - bottom — Nastavení + dark-mode toggle
  Active item → filled dark-green with soft green-tinted shadow (light mode).
  The collapsed state and collapse toggle behavior are preserved.
- **Pill tab groups:** for in-page tab navigation (e.g. settings sections),
  rounded-full segmented control with green active pill. Only where tabs
  already exist or clearly help; not invented for its own sake.
- **Right-rail summary cards:** the small info/stat cards beside a main form
  (settings, detail pages) where supporting info exists to surface.

## Out of scope / constraints

- **PDF & print styles are untouched.** The `.invoice-a4` block and
  `@media print` rules in `globals.css` (and `InvoicePreview.module.css`)
  control the generated invoice appearance and must remain visually stable
  regardless of app theme. The re-skin applies to the app chrome only.
- No font family change. No new dependencies.
- No functional/behavioral changes — visual only.

## Verification

The user cannot confirm the palette from text, so verification is in-browser:
run the dev server, apply changes, and capture light- and dark-mode
screenshots of representative pages (invoice list, settings, a form, a table)
before finalizing. Tune the dark-forest palette against real screenshots.

## Risks

- **Hardcoded values bypassing tokens:** some pages may use literal
  colors/radii (e.g. `text-orange-…`, `rounded-lg`, `bg-white`). The sweep
  step must catch these; grep for literals during implementation.
- **Contrast in dark mode:** the derived forest palette needs a visual pass
  to ensure text/accent contrast meets legibility (esp. green accent on dark).
- **Very round cards (20–26px)** can look odd on dense tables; validate table
  containers visually and dial radius per-context if needed.
