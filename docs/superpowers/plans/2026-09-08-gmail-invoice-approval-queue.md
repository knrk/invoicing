# Gmail Invoice Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Gmail invoice loading so a check stages new invoices in a DB queue that the admin approves or rejects; only approval writes to `costs`, and every decision is tracked so processed emails are never re-offered.

**Architecture:** A new `gmail_pending` staging table holds parsed drafts between check and decision. `checkGmail()` inserts drafts (no `costs` write, no attachment upload). A new "Ke schválení" section on `/costs` lets the admin edit + approve (→ `createCost` + upload attachment fetched lazily + `gmail_processed(decision='approved')`) or reject (→ `gmail_processed(decision='rejected')`). Dedup at check = union of `gmail_processed` and `gmail_pending` keys.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + Storage, no ORM), Zod v4, React 19, shadcn/ui, sonner, Biome, Vitest (added here for pure-logic unit tests).

**Design reference:** [`docs/superpowers/specs/2026-09-08-gmail-invoice-approval-queue-design.md`](../specs/2026-09-08-gmail-invoice-approval-queue-design.md)

**Conventions (from CLAUDE.md / AGENTS.md):** English file names; no `any`; no React index keys (use `row.id`); before writing Next.js code consult `node_modules/next/dist/docs/`.

---

## File Structure

- Create: `supabase/migrations/20260908_gmail_approval_queue.sql` — DDL for `gmail_pending` + `decision` column.
- Modify: `supabase-schema.sql` — mirror the same DDL into the canonical schema.
- Modify: `lib/schemas.ts` — add `GmailPendingSchema` + `GmailPending` type.
- Modify: `types/index.ts` — re-export `GmailPending`.
- Modify: `lib/gmail-api.ts` — add `GmailCheckResult` + `GmailPendingPreview` types.
- Create: `lib/gmail-parse.ts` — pure (no `"use server"`) helpers moved out of `gmail.ts`: `receivedDateFromMessage`, `supplierFromSender`, `pendingKey`, `buildPendingDrafts`, `PendingDraft`.
- Create: `lib/gmail-parse.test.ts` — Vitest unit tests for `buildPendingDrafts`.
- Create: `vitest.config.ts` — minimal Node-env config with `@/` alias.
- Modify: `package.json` — add `vitest` devDep + `test` scripts.
- Modify: `lib/gmail.ts` — replace `syncGmailCosts` with `checkGmail` (stage into pending); add `approvePending`, `rejectPending`, `getPendingAttachmentPreview`, `listPendingGmail`; update `reimportAllGmail`; delete moved helpers + `processOneMessage`.
- Create: `components/costs/PendingGmailList.tsx` — approval-queue UI (list + reject + approve dialog reusing `CostForm` + lazy preview).
- Modify: `components/costs/CostListClient.tsx` — call `checkGmail`, new toast, render `<PendingGmailList>`, accept `pending` prop.
- Modify: `app/(app)/costs/page.tsx` — load pending via `listPendingGmail()`, pass down.
- Modify: `components/costs/GmailIntegrationSettings.tsx` — call `checkGmail`; update toasts to `res.added`.

---

## Task 1: Database — staging table + decision column

**Files:**
- Create: `supabase/migrations/20260908_gmail_approval_queue.sql`
- Modify: `supabase-schema.sql` (append after the `gmail_processed` block, currently ending ~line 186)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260908_gmail_approval_queue.sql`:

```sql
-- Gmail faktury: fronta ke schválení + stav rozhodnutí.

-- 1) Staging tabulka čekajících faktur (mezi checkem a rozhodnutím).
create table if not exists gmail_pending (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  attachment_id text not null,
  parsed jsonb not null,
  email_subject text not null default '',
  email_from text not null default '',
  received_date date,
  attachment_name text,
  has_pdf boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, attachment_id)
);
alter table gmail_pending enable row level security;
drop policy if exists "anon full access gmail_pending" on gmail_pending;
create policy "anon full access gmail_pending" on gmail_pending
  for all to anon using (true) with check (true);

-- 2) Stav rozhodnutí u zpracovaných zpráv (approved / rejected).
alter table gmail_processed add column if not exists decision text not null default 'approved';
alter table gmail_processed drop constraint if exists gmail_processed_decision_check;
alter table gmail_processed add constraint gmail_processed_decision_check
  check (decision in ('approved','rejected'));
```

- [ ] **Step 2: Mirror the same DDL into the canonical schema**

In `supabase-schema.sql`, immediately after the `gmail_processed` policy block (the `create policy "anon full access gmail_processed" ...` statement, ~line 186), insert:

```sql

-- Stav rozhodnutí u zpracovaných zpráv (approved / rejected).
alter table gmail_processed add column if not exists decision text not null default 'approved';
alter table gmail_processed drop constraint if exists gmail_processed_decision_check;
alter table gmail_processed add constraint gmail_processed_decision_check
  check (decision in ('approved','rejected'));

-- Fronta čekajících Gmail faktur ke schválení (mezi checkem a rozhodnutím).
create table if not exists gmail_pending (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  attachment_id text not null,
  parsed jsonb not null,
  email_subject text not null default '',
  email_from text not null default '',
  received_date date,
  attachment_name text,
  has_pdf boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, attachment_id)
);
alter table gmail_pending enable row level security;
drop policy if exists "anon full access gmail_pending" on gmail_pending;
create policy "anon full access gmail_pending" on gmail_pending
  for all to anon using (true) with check (true);
```

- [ ] **Step 3: Apply the migration in Supabase**

This repo has no local DB/CLI migration runner — apply the SQL manually. Run the contents of `supabase/migrations/20260908_gmail_approval_queue.sql` in the Supabase SQL editor for the project.
Expected: `gmail_pending` table exists and `gmail_processed` has a `decision` column.
(If you cannot reach Supabase, note this step as pending for the user and continue — later tasks compile without it.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260908_gmail_approval_queue.sql supabase-schema.sql
git commit -m "feat(db): gmail_pending queue + decision column on gmail_processed"
```

---

## Task 2: Types & schemas

**Files:**
- Modify: `lib/schemas.ts` (add after the `CostSchema` block, ~line 194)
- Modify: `types/index.ts`
- Modify: `lib/gmail-api.ts` (add near the other exported interfaces, ~line 121)

- [ ] **Step 1: Add `GmailPendingSchema` + type to `lib/schemas.ts`**

After the `export const CostSchema = ...` block (ends ~line 194), add:

```ts
// Čekající Gmail faktura ve frontě ke schválení. `parsed` = editovatelný draft
// ve tvaru CostFormData; ostatní pole jsou pro zobrazení v seznamu.
export const GmailPendingSchema = z.object({
  id: z.string().uuid(),
  message_id: z.string(),
  attachment_id: z.string(),
  parsed: CostFormDataSchema,
  email_subject: z.string().default(""),
  email_from: z.string().default(""),
  received_date: z.string().nullable().default(null),
  attachment_name: z.string().nullable().default(null),
  has_pdf: z.boolean().default(false),
  created_at: z.string(),
})
```

And in the type-export block (near `export type Cost = ...`, ~line 205) add:

```ts
export type GmailPending = z.infer<typeof GmailPendingSchema>
```

- [ ] **Step 2: Re-export from the types barrel**

In `types/index.ts`, add `GmailPending` to the `export type { ... } from "@/lib/schemas"` list:

```ts
  Cost,
  GmailPending,
  SupplierRecord,
```

- [ ] **Step 3: Add result/preview types to `lib/gmail-api.ts`**

After the `export interface GmailSyncResult { ... }` block (~line 121), add:

```ts
// Výsledek checku: kolik NOVÝCH čekajících faktur přibylo do fronty.
export interface GmailCheckResult {
  added: number
  errors: string[]
  needsReconnect?: boolean
  error?: string
}

// Náhled přílohy čekající faktury (lazy, bez uploadu do Storage).
export type GmailPendingPreview =
  | { kind: "pdf"; base64: string }
  | { kind: "html"; html: string }
  | { error: string; needsReconnect?: boolean }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add lib/schemas.ts types/index.ts lib/gmail-api.ts
git commit -m "feat(types): GmailPending, GmailCheckResult, GmailPendingPreview"
```

---

## Task 3: Pure parse module `lib/gmail-parse.ts` (TDD)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `lib/gmail-parse.test.ts`
- Create: `lib/gmail-parse.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm i -D vitest`
Expected: `vitest` added to `devDependencies`.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Write the failing test `lib/gmail-parse.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import type { GmailMessage } from "@/lib/gmail-api"
import { buildPendingDrafts, pendingKey } from "@/lib/gmail-parse"

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url")

function msgWithPdf(): GmailMessage {
  return {
    id: "m1",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "From", value: "Dodavatel s.r.o. <fakturace@dodavatel.cz>" },
        { name: "Subject", value: "Faktura 2024001" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64url("Variabilní symbol 12345") } },
        { mimeType: "application/pdf", filename: "faktura.pdf", body: { attachmentId: "att1" } },
      ],
    },
  }
}

function msgHtmlOnly(): GmailMessage {
  return {
    id: "m2",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "From", value: "Apple <no_reply@apple.com>" },
        { name: "Subject", value: "Your receipt" },
      ],
      parts: [{ mimeType: "text/html", body: { data: b64url("<p>Receipt</p>") } }],
    },
  }
}

function msgNoContent(): GmailMessage {
  return { id: "m3", internalDate: "1700000000000", payload: { headers: [], parts: [] } }
}

describe("buildPendingDrafts", () => {
  it("vytvoří draft na PDF přílohu s parsovaným VS", () => {
    const drafts = buildPendingDrafts(msgWithPdf(), [], new Set())
    expect(drafts).toHaveLength(1)
    expect(drafts[0].attachment_id).toBe("att1")
    expect(drafts[0].has_pdf).toBe(true)
    expect(drafts[0].attachment_name).toBe("faktura.pdf")
    expect(drafts[0].parsed.variable_symbol).toBe("12345")
    expect(drafts[0].parsed.source).toBe("gmail")
  })

  it("bez PDF vytvoří body draft z HTML těla", () => {
    const drafts = buildPendingDrafts(msgHtmlOnly(), [], new Set())
    expect(drafts).toHaveLength(1)
    expect(drafts[0].attachment_id).toBe("body")
    expect(drafts[0].has_pdf).toBe(false)
    expect(drafts[0].attachment_name).toBeNull()
  })

  it("přeskočí už známé dvojice", () => {
    const known = new Set([pendingKey("m1", "att1")])
    expect(buildPendingDrafts(msgWithPdf(), [], known)).toHaveLength(0)
  })

  it("bez PDF a bez těla nevytvoří nic", () => {
    expect(buildPendingDrafts(msgNoContent(), [], new Set())).toHaveLength(0)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run`
Expected: FAIL — cannot resolve `@/lib/gmail-parse` (module not created yet).

- [ ] **Step 6: Create `lib/gmail-parse.ts`**

```ts
// Čisté (server-safe, bez "use server") helpery pro Gmail import: sestaví
// drafty čekajících faktur z Gmail zprávy. Žádné Supabase/Next → testovatelné.

import {
  extractHtmlBody,
  extractPdfAttachments,
  getBodyText,
  getHeader,
  type GmailMessage,
  parseEmailFields,
  parseSender,
} from "@/lib/gmail-api"
import type { CostFormData, SupplierRecord } from "@/lib/schemas"

// "YYYY-MM-DD" pro dnešek (lokálně).
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Datum přijetí e-mailu (internalDate = ms epoch) → "YYYY-MM-DD" (lokálně).
export function receivedDateFromMessage(internalDate: string | undefined): string {
  if (!internalDate) return todayISO()
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return todayISO()
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Dodavatel z odesílatele: sedí-li e-mail/doména na uloženého dodavatele,
// předvyplní se celý; jinak jen název z odesílatele.
export function supplierFromSender(
  saved: SupplierRecord[],
  sender: { name: string; email: string }
): CostFormData["supplier"] {
  const email = sender.email
  const domain = email.includes("@") ? email.split("@")[1] : ""
  const match =
    (email ? saved.find((s) => s.email.toLowerCase() === email) : undefined) ??
    (domain
      ? saved.find((s) => s.email && s.email.toLowerCase().split("@")[1] === domain)
      : undefined)
  if (match) {
    return {
      name: match.name,
      ico: match.ico,
      dic: match.dic,
      street: match.street,
      zip: match.zip,
      city: match.city,
      country: match.country,
    }
  }
  return {
    name: sender.name || sender.email,
    ico: "",
    dic: "",
    street: "",
    zip: "",
    city: "",
    country: "CZ",
  }
}

function gmailCostForm(
  note: string,
  receivedDate: string,
  supplier: CostFormData["supplier"],
  fields: ReturnType<typeof parseEmailFields>
): CostFormData {
  return {
    supplier,
    invoice_number: fields.invoice_number,
    variable_symbol: fields.variable_symbol,
    currency: fields.currency ?? "CZK",
    issue_date: "",
    due_date: fields.due_date,
    received_date: receivedDate,
    total: fields.total ?? 0,
    vat_amount: null,
    reverse_charge: false,
    is_eu_supplier: false,
    note,
    source: "gmail",
  }
}

// Dedup klíč. "body" pro faktury bez PDF (v HTML těle).
export function pendingKey(messageId: string, attachmentId: string): string {
  return `${messageId}:${attachmentId}`
}

export interface PendingDraft {
  message_id: string
  attachment_id: string
  parsed: CostFormData
  email_subject: string
  email_from: string
  received_date: string
  attachment_name: string | null
  has_pdf: boolean
}

// Z jedné Gmail zprávy sestaví drafty čekajících faktur (jeden na PDF, nebo
// jeden pro HTML tělo když PDF není). Vynechá dvojice už obsažené ve `known`.
export function buildPendingDrafts(
  message: GmailMessage,
  savedSuppliers: SupplierRecord[],
  known: Set<string>
): PendingDraft[] {
  const msgId = message.id
  const from = getHeader(message, "From")
  const subject = getHeader(message, "Subject")
  const received = receivedDateFromMessage(message.internalDate)
  const note = `Z Gmailu — ${subject || "(bez předmětu)"} — ${from}`
  const fields = parseEmailFields(subject, getBodyText(message))
  const supplier = supplierFromSender(savedSuppliers, parseSender(from))
  const parsed = gmailCostForm(note, received, supplier, fields)

  const pdfs = extractPdfAttachments(message)
  const drafts: PendingDraft[] = []

  if (pdfs.length > 0) {
    for (const pdf of pdfs) {
      const key = pendingKey(msgId, pdf.attachmentId)
      if (known.has(key)) continue
      drafts.push({
        message_id: msgId,
        attachment_id: pdf.attachmentId,
        parsed,
        email_subject: subject,
        email_from: from,
        received_date: received,
        attachment_name: pdf.filename,
        has_pdf: true,
      })
    }
    return drafts
  }

  // Bez PDF → faktura v HTML těle (např. Apple). Jen když tělo existuje.
  const key = pendingKey(msgId, "body")
  if (known.has(key)) return drafts
  if (extractHtmlBody(message) === null) return drafts
  drafts.push({
    message_id: msgId,
    attachment_id: "body",
    parsed,
    email_subject: subject,
    email_from: from,
    received_date: received,
    attachment_name: null,
    has_pdf: false,
  })
  return drafts
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/gmail-parse.ts lib/gmail-parse.test.ts
git commit -m "feat(gmail): pure buildPendingDrafts module + vitest"
```

---

## Task 4: Refactor `lib/gmail.ts` — `checkGmail` stages into the queue

**Files:**
- Modify: `lib/gmail.ts`

- [ ] **Step 1: Replace the import block (lines 1–33)**

Replace the top of `lib/gmail.ts` (through the `import { revalidatePath }` line) with:

```ts
"use server"

import { requireAdmin } from "@/lib/auth"
import { createCost, uploadCostFile } from "@/lib/costs"
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  extractHtmlBody,
  getAttachmentBase64,
  getMessage,
  getProfileEmail,
  getProfileHistoryId,
  GmailAuthError,
  type GmailCheckResult,
  GmailHistoryExpiredError,
  type GmailLabel,
  type GmailPendingPreview,
  type GmailStatus,
  listAllMessageIds,
  listHistory,
  listLabels,
  refreshAccessToken,
} from "@/lib/gmail-api"
import { buildPendingDrafts, pendingKey, receivedDateFromMessage } from "@/lib/gmail-parse"
import {
  type CostFormData,
  CostFormDataSchema,
  formatZodError,
  type GmailPending,
  GmailPendingSchema,
} from "@/lib/schemas"
import { createClient } from "@/lib/supabase/server"
import { getSuppliers } from "@/lib/suppliers"
import { revalidatePath } from "next/cache"

type Supabase = Awaited<ReturnType<typeof createClient>>
```

- [ ] **Step 2: Delete the moved helpers and old sync code**

Delete these now-relocated / replaced blocks from `lib/gmail.ts`:
- `receivedDateFromMessage` (old local copy, ~lines 37–44)
- `supplierFromSender` (~lines 46–79)
- `gmailCostForm` (~lines 81–97)
- `processOneMessage` (~lines 220–302)
- `syncGmailCosts` (~lines 328–430) — replaced by `checkGmail` in Step 3

Keep `getGmailAuthUrl`, `connectGmail`, `getGmailStatus`, `accessTokenFromStore`, `listGmailLabels`, `setGmailLabel`, `disconnectGmail`, and `resolveCandidateMessages` unchanged. Keep `backfillGmailReceivedDates` (it now uses the imported `receivedDateFromMessage`).

- [ ] **Step 3: Add `checkGmail` (where `syncGmailCosts` was)**

```ts
// Vyhledá nové faktury v labelu a založí je do fronty ke schválení
// (gmail_pending). Nezapisuje do costs ani nenahrává přílohy — to až schválení.
// Inkrementální přes History API; dedup = gmail_processed ∪ gmail_pending.
export async function checkGmail(): Promise<GmailCheckResult> {
  try {
    await requireAdmin()
  } catch (e) {
    return { added: 0, errors: [], error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { data: integ } = await supabase
    .from("gmail_integration")
    .select("refresh_token, label_id, history_id")
    .eq("id", 1)
    .single()
  if (!integ?.refresh_token) return { added: 0, errors: [], error: "Gmail není připojen" }
  if (!integ.label_id) return { added: 0, errors: [], error: "Není zvolený label" }

  let token: string
  try {
    token = await refreshAccessToken(integ.refresh_token)
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return { added: 0, errors: [], needsReconnect: true, error: "Přístup vypršel, připoj Gmail znovu." }
    }
    return { added: 0, errors: [], error: err instanceof Error ? err.message : "Chyba přístupu ke Gmailu" }
  }

  // Známé dvojice = už rozhodnuté (gmail_processed) + už čekající (gmail_pending).
  const [{ data: processedRows }, { data: pendingRows }] = await Promise.all([
    supabase.from("gmail_processed").select("message_id, attachment_id"),
    supabase.from("gmail_pending").select("message_id, attachment_id"),
  ])
  const known = new Set<string>([
    ...(processedRows ?? []).map((r) => pendingKey(r.message_id, r.attachment_id)),
    ...(pendingRows ?? []).map((r) => pendingKey(r.message_id, r.attachment_id)),
  ])
  const savedSuppliers = await getSuppliers()

  let messageIds: string[]
  let nextHistoryId: string | null
  try {
    const resolved = await resolveCandidateMessages(token, integ.label_id, integ.history_id ?? null)
    messageIds = resolved.messageIds
    nextHistoryId = resolved.nextHistoryId
  } catch (err) {
    return { added: 0, errors: [], error: err instanceof Error ? err.message : "Nepodařilo se načíst zprávy" }
  }

  let added = 0
  const errors: string[] = []
  for (const msgId of messageIds) {
    try {
      const message = await getMessage(token, msgId)
      const drafts = buildPendingDrafts(message, savedSuppliers, known)
      for (const draft of drafts) {
        const { error } = await supabase
          .from("gmail_pending")
          .upsert(draft, { onConflict: "message_id,attachment_id", ignoreDuplicates: true })
        if (error) {
          errors.push(`${draft.attachment_name ?? msgId}: ${error.message}`)
          continue
        }
        known.add(pendingKey(draft.message_id, draft.attachment_id))
        added++
      }
    } catch (err) {
      errors.push(`Zpráva ${msgId}: ${err instanceof Error ? err.message : "chyba"}`)
    }
  }

  // Kotvu posuň jen po čistém běhu (nerozhodnuté položky bezpečně žijí v pending).
  const patch: { last_sync_at: string; updated_at: string; history_id?: string } = {
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (errors.length === 0 && nextHistoryId) patch.history_id = nextHistoryId
  await supabase.from("gmail_integration").update(patch).eq("id", 1)

  revalidatePath("/costs")
  revalidatePath("/settings")
  return { added, errors }
}
```

- [ ] **Step 4: Update `reimportAllGmail` to clear the queue and re-check**

Change its return type to `Promise<GmailCheckResult>`, update the early permission-error return shape, add a `gmail_pending` clear, and re-check at the end. Replace the whole function with:

```ts
// Smaže dosavadní Gmail náklady + frontu + dedup log a spustí check znovu
// (vše spadne zpět do fronty ke schválení). Ruční uploady (source='upload') nechává.
export async function reimportAllGmail(): Promise<GmailCheckResult> {
  try {
    await requireAdmin()
  } catch (e) {
    return { added: 0, errors: [], error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()

  const { data: gmailCosts } = await supabase
    .from("costs")
    .select("id, file_path")
    .eq("source", "gmail")
  const ids = (gmailCosts ?? []).map((c) => c.id)
  if (ids.length > 0) {
    await supabase.from("costs").delete().in("id", ids)
    const paths = (gmailCosts ?? [])
      .map((c) => c.file_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0)
    if (paths.length > 0) await supabase.storage.from("costs").remove(paths)
  }

  // Vyčisti frontu i dedup log (message_id je vždy neprázdné → smaže vše).
  await supabase.from("gmail_pending").delete().not("message_id", "is", null)
  await supabase.from("gmail_processed").delete().not("message_id", "is", null)

  // Vynuluj kotvu → následný check udělá plný resync celého labelu.
  await supabase
    .from("gmail_integration")
    .update({ history_id: null, updated_at: new Date().toISOString() })
    .eq("id", 1)

  return checkGmail()
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If Biome later flags an unused import, remove it — `checkGmail`/`reimportAllGmail` should now use every symbol in the new import block except those reserved for Task 5.)

- [ ] **Step 6: Commit**

```bash
git add lib/gmail.ts
git commit -m "feat(gmail): checkGmail stages invoices into approval queue"
```

---

## Task 5: Decision server actions in `lib/gmail.ts`

**Files:**
- Modify: `lib/gmail.ts` (add these exports, e.g. right after `checkGmail`)

- [ ] **Step 1: Add `listPendingGmail`**

```ts
// Načte frontu čekajících faktur pro UI (nejnovější první).
export async function listPendingGmail(): Promise<GmailPending[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("gmail_pending")
    .select("*")
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data.flatMap((row) => {
    const parsed = GmailPendingSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}
```

- [ ] **Step 2: Add `approvePending`**

```ts
// Schválí čekající fakturu: založí náklad, lazy stáhne+nahraje přílohu a zapíše
// rozhodnutí. Claim guard (smazání pending řádku) brání dvojímu zpracování;
// při chybě před založením nákladu se řádek vrátí do fronty.
export async function approvePending(
  id: string,
  form: CostFormData
): Promise<{ error?: string; needsReconnect?: boolean }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const parsed = CostFormDataSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()

  // Claim: odeber řádek z fronty. Když už není, někdo rozhodl dřív → hotovo.
  const { data: claimed } = await supabase
    .from("gmail_pending")
    .delete()
    .eq("id", id)
    .select("*")
    .single()
  if (!claimed) return {}

  const restore = async () => {
    await supabase.from("gmail_pending").insert(claimed)
  }

  const { data: integ } = await supabase
    .from("gmail_integration")
    .select("refresh_token")
    .eq("id", 1)
    .single()
  if (!integ?.refresh_token) {
    await restore()
    return { error: "Gmail není připojen" }
  }

  let token: string
  try {
    token = await refreshAccessToken(integ.refresh_token)
  } catch (err) {
    await restore()
    if (err instanceof GmailAuthError) {
      return { needsReconnect: true, error: "Přístup vypršel, připoj Gmail znovu." }
    }
    return { error: err instanceof Error ? err.message : "Chyba přístupu ke Gmailu" }
  }

  const created = await createCost(parsed.data)
  if (created.error || !created.data) {
    await restore()
    return { error: created.error ?? "Vytvoření nákladu selhalo" }
  }
  const costId = created.data.id

  // Náklad založen → rozhodnutí zapíšeme vždy (upload přílohy je měkká chyba).
  try {
    if (claimed.has_pdf) {
      const base64 = await getAttachmentBase64(token, claimed.message_id, claimed.attachment_id)
      const up = await uploadCostFile(costId, claimed.attachment_name ?? "faktura.pdf", base64)
      if (up.error) return { error: `Náklad uložen, ale PDF se nenahrálo: ${up.error}` }
    } else {
      const message = await getMessage(token, claimed.message_id)
      const html = extractHtmlBody(message)
      if (html) {
        const base64 = Buffer.from(html, "utf8").toString("base64")
        const up = await uploadCostFile(costId, "faktura.html", base64, "text/html; charset=utf-8")
        if (up.error) return { error: `Náklad uložen, ale tělo se nenahrálo: ${up.error}` }
      }
    }
  } catch (err) {
    return { error: `Náklad uložen, ale příloha se nenahrála: ${err instanceof Error ? err.message : "chyba"}` }
  } finally {
    await supabase.from("gmail_processed").insert({
      message_id: claimed.message_id,
      attachment_id: claimed.attachment_id,
      decision: "approved",
      cost_id: costId,
    })
    revalidatePath("/costs")
    revalidatePath("/")
  }

  return {}
}
```

- [ ] **Step 3: Add `rejectPending`**

```ts
// Odmítne čekající fakturu: zapíše rozhodnutí 'rejected' a odebere z fronty.
export async function rejectPending(id: string): Promise<{ error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { data: claimed } = await supabase
    .from("gmail_pending")
    .delete()
    .eq("id", id)
    .select("message_id, attachment_id")
    .single()
  if (!claimed) return {}

  const { error } = await supabase.from("gmail_processed").insert({
    message_id: claimed.message_id,
    attachment_id: claimed.attachment_id,
    decision: "rejected",
    cost_id: null,
  })
  if (error) return { error: error.message }

  revalidatePath("/costs")
  return {}
}
```

- [ ] **Step 4: Add `getPendingAttachmentPreview`**

```ts
// Lazy náhled přílohy čekající faktury (bez uploadu do Storage).
export async function getPendingAttachmentPreview(id: string): Promise<GmailPendingPreview> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from("gmail_pending")
    .select("message_id, attachment_id, has_pdf")
    .eq("id", id)
    .single()
  if (!row) return { error: "Položka už není ve frontě" }

  const { data: integ } = await supabase
    .from("gmail_integration")
    .select("refresh_token")
    .eq("id", 1)
    .single()
  if (!integ?.refresh_token) return { error: "Gmail není připojen" }

  let token: string
  try {
    token = await refreshAccessToken(integ.refresh_token)
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return { error: "Přístup vypršel, připoj Gmail znovu.", needsReconnect: true }
    }
    return { error: err instanceof Error ? err.message : "Chyba přístupu ke Gmailu" }
  }

  try {
    if (row.has_pdf) {
      const base64 = await getAttachmentBase64(token, row.message_id, row.attachment_id)
      return { kind: "pdf", base64 }
    }
    const message = await getMessage(token, row.message_id)
    return { kind: "html", html: extractHtmlBody(message) ?? "" }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Náhled se nepodařil" }
  }
}
```

- [ ] **Step 5: Typecheck + run unit tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (tsc clean; 4 vitest tests pass).

- [ ] **Step 6: Commit**

```bash
git add lib/gmail.ts
git commit -m "feat(gmail): approve/reject/preview/list pending server actions"
```

---

## Task 6: `PendingGmailList` component

**Files:**
- Create: `components/costs/PendingGmailList.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client"

import CostForm from "@/components/costs/CostForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { approvePending, getPendingAttachmentPreview, rejectPending } from "@/lib/gmail"
import type { CostFormData, GmailPending } from "@/types"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

interface Props {
  pending: GmailPending[]
}

type Preview =
  | { kind: "loading" }
  | { kind: "pdf"; base64: string }
  | { kind: "html"; html: string }
  | { kind: "error"; message: string }

export default function PendingGmailList({ pending }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<GmailPending | null>(null)
  const [form, setForm] = useState<CostFormData | null>(null)
  const [preview, setPreview] = useState<Preview>({ kind: "loading" })
  const [busy, setBusy] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  async function openRow(row: GmailPending) {
    setActive(row)
    setForm(row.parsed)
    setPreview({ kind: "loading" })
    const res = await getPendingAttachmentPreview(row.id)
    if ("error" in res) setPreview({ kind: "error", message: res.error })
    else setPreview(res)
  }

  function close() {
    setActive(null)
    setForm(null)
  }

  async function handleApprove() {
    if (!active || !form) return
    setBusy(true)
    const res = await approvePending(active.id, form)
    setBusy(false)
    if (res.error) {
      toast.error("Schválení selhalo", { description: res.error })
      return
    }
    toast.success("Faktura schválena a uložena")
    close()
    router.refresh()
  }

  async function handleReject(id: string) {
    setRejectingId(id)
    const res = await rejectPending(id)
    setRejectingId(null)
    if (res.error) {
      toast.error("Odmítnutí selhalo", { description: res.error })
      return
    }
    toast.success("Faktura odmítnuta")
    if (active?.id === id) close()
    router.refresh()
  }

  if (pending.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-text">Ke schválení z Gmailu</h2>
        <span className="inline-flex items-center rounded-full border border-border bg-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">
          {pending.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {pending.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-text">
                {row.parsed.supplier.name || row.email_from || "—"}
              </div>
              <div className="truncate text-xs text-text-secondary">
                {row.email_subject || "(bez předmětu)"}
              </div>
            </div>
            <Badge variant="blue" className="rounded-full normal-case tracking-normal">
              {row.has_pdf ? "PDF" : "E-mail"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => openRow(row)}>
              Zkontrolovat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={rejectingId === row.id}
              onClick={() => handleReject(row.id)}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              {rejectingId === row.id ? "Odmítám…" : "Odmítnout"}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!active} onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[60rem] flex-col overflow-hidden p-0">
          <DialogHeader className="mb-0 shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Zkontrolovat fakturu z Gmailu</DialogTitle>
          </DialogHeader>
          <div className="grid flex-1 grid-cols-2 overflow-hidden">
            <div className="overflow-y-auto border-r border-border bg-subtle p-2">
              {preview.kind === "loading" && (
                <p className="p-4 text-sm text-text-secondary">Načítám náhled…</p>
              )}
              {preview.kind === "error" && (
                <p className="p-4 text-sm text-danger">{preview.message}</p>
              )}
              {preview.kind === "pdf" && (
                <iframe
                  title="Náhled PDF"
                  src={`data:application/pdf;base64,${preview.base64}`}
                  className="h-full min-h-[70vh] w-full rounded-md bg-white"
                />
              )}
              {preview.kind === "html" && (
                <iframe
                  title="Náhled e-mailu"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-full min-h-[70vh] w-full rounded-md bg-white"
                />
              )}
            </div>
            <div className="overflow-y-auto p-6">
              {form && <CostForm value={form} onChange={setForm} />}
            </div>
          </div>
          <DialogFooter className="mt-0 shrink-0 items-center border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              disabled={busy || !active}
              onClick={() => active && handleReject(active.id)}
              className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
            >
              Odmítnout
            </Button>
            <Button variant="outline" onClick={close} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="dark" onClick={handleApprove} disabled={busy || !form}>
              {busy ? "Schvaluji…" : "Schválit a uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `Badge` has no `blue` variant in this project, pick an existing variant (the costs table uses `green`/`red`/`blue`, so `blue` is valid).

- [ ] **Step 3: Commit**

```bash
git add components/costs/PendingGmailList.tsx
git commit -m "feat(costs): PendingGmailList approval-queue UI"
```

---

## Task 7: Wire the queue into the page

**Files:**
- Modify: `app/(app)/costs/page.tsx`
- Modify: `components/costs/CostListClient.tsx`
- Modify: `components/costs/GmailIntegrationSettings.tsx`

- [ ] **Step 1: Load pending in the page and pass it down**

Replace `app/(app)/costs/page.tsx` with:

```tsx
import CostListClient from "@/components/costs/CostListClient"
import { getCosts } from "@/lib/costs"
import { getGmailStatus, listPendingGmail } from "@/lib/gmail"

export default async function CostsPage() {
  const [costs, gmail, pending] = await Promise.all([
    getCosts(),
    getGmailStatus(),
    listPendingGmail(),
  ])
  const gmailReady = gmail.connected && !!gmail.labelId

  return (
    <main className="mx-auto max-w-7xl px-10 py-8">
      <CostListClient costs={costs} gmailReady={gmailReady} pending={pending} />
    </main>
  )
}
```

- [ ] **Step 2: Update `CostListClient` imports**

In `components/costs/CostListClient.tsx`:
- Replace `import { syncGmailCosts } from "@/lib/gmail"` with `import { checkGmail } from "@/lib/gmail"`.
- Add `import PendingGmailList from "@/components/costs/PendingGmailList"` (next to the other component imports).
- Change `import type { Cost } from "@/types"` to `import type { Cost, GmailPending } from "@/types"`.

- [ ] **Step 3: Accept the `pending` prop**

Change the `Props` interface and the component signature:

```tsx
interface Props {
  costs: Cost[]
  gmailReady?: boolean
  pending?: GmailPending[]
}

export default function CostListClient({ costs, gmailReady = false, pending = [] }: Props) {
```

- [ ] **Step 4: Replace `handleGmailSync`**

Replace the existing `handleGmailSync` function with:

```tsx
  async function handleGmailSync() {
    setSyncing(true)
    const res = await checkGmail()
    setSyncing(false)
    if (res.needsReconnect) {
      toast.error("Přístup vypršel", { description: "Připoj Gmail znovu v Nastavení." })
      return
    }
    if (res.error) {
      toast.error("Kontrola Gmailu selhala", { description: res.error })
      return
    }
    toast.success(
      res.added > 0 ? `Nalezeno ${res.added} nových faktur ke schválení` : "Žádné nové faktury"
    )
    if (res.errors.length) {
      toast.error("Některé zprávy se nenačetly", { description: res.errors.slice(0, 3).join("; ") })
    }
    router.refresh()
  }
```

- [ ] **Step 5: Render the queue above the toolbar**

In the returned JSX, immediately after the stat-cards grid (`</div>` closing `<div className="mb-6 grid grid-cols-3 gap-4">`) and before `<div className="mb-4 flex flex-wrap items-center justify-between gap-3">`, insert:

```tsx
      {isAdmin && <PendingGmailList pending={pending} />}
```

- [ ] **Step 6: Update the settings component**

In `components/costs/GmailIntegrationSettings.tsx`:
- In the `@/lib/gmail` import (lines 19–26), replace `syncGmailCosts` with `checkGmail`.
- In `handleSync`, replace `const res = await syncGmailCosts()` with `const res = await checkGmail()`, and replace the success toast block:

```tsx
    toast.success(
      res.added > 0 ? `Nalezeno ${res.added} nových faktur ke schválení` : "Žádné nové faktury"
    )
    if (res.errors.length) {
      toast.error("Některé zprávy se nenačetly", { description: res.errors.slice(0, 3).join("; ") })
    }
```

- In `handleReimport`, replace the success toast `toast.success(`Přeimportováno: ${res.imported} nákladů`)` with:

```tsx
    toast.success(`Přeimport hotov: ${res.added} faktur ke schválení`)
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/(app)/costs/page.tsx components/costs/CostListClient.tsx components/costs/GmailIntegrationSettings.tsx
git commit -m "feat(costs): wire Gmail approval queue into costs page + settings"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint + typecheck + unit tests**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: Biome clean (no errors), tsc clean, 4 vitest tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `biome lint` passes and `next build` completes without type errors.
Note: `next dev` is known to OOM after ~28 min (see memory `dev-server-oom-investigation.md`); prefer `npm run build` for a full check, and keep any dev-server preview session short.

- [ ] **Step 3: Manual browser check (requires the Supabase migration applied + a connected Gmail label)**

Use the Browser preview tools (`preview_start` with the dev server, or `{url}` of a running instance). Verify on `/costs`:
1. Click **Zkontrolovat Gmail** → toast reports "Nalezeno N nových faktur ke schválení"; a "Ke schválení z Gmailu" section appears with N rows (no new rows in the "Přijaté faktury" table yet).
2. Click **Zkontrolovat** on a row → dialog opens, PDF/e-mail preview loads lazily, fields are editable.
3. Click **Schválit a uložit** → row leaves the queue and appears in "Přijaté faktury" with the attachment.
4. Click **Odmítnout** on another row → row leaves the queue, no cost created.
5. Click **Zkontrolovat Gmail** again → neither the approved nor the rejected email reappears in the queue.

Capture a screenshot of the queue section as proof.

---

## Self-Review notes

- **Spec coverage:** check→queue (Task 4), approve writes to DB (Task 5 `approvePending`), reject tracked (Task 5 `rejectPending`), decisions in `gmail_processed.decision` (Task 1), processed+pending excluded from re-offer (Task 4 dedup union), lazy attachment upload + preview (Task 5), editable before approve (Task 6 reuses `CostForm`), same-page UI (Task 7 Step 5), no reject-review UI (out of scope). All covered.
- **Type consistency:** `GmailCheckResult { added, errors, needsReconnect?, error? }` used by `checkGmail`, `reimportAllGmail`, and both UI call sites. `GmailPending.parsed` is `CostFormData`, consumed directly by `CostForm`. `PendingDraft` keys match `gmail_pending` columns exactly for `upsert`. `pendingKey` shared by pure module and `checkGmail`.
- **No placeholders:** every code step contains full content.
```
