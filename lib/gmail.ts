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
import { buildPendingDrafts, isFromYear, pendingKey, receivedDateFromMessage } from "@/lib/gmail-parse"
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

export async function getGmailAuthUrl(): Promise<string> {
  await requireAdmin()
  return buildAuthUrl()
}

// Volané z callback route po návratu z Google consent.
export async function connectGmail(code: string): Promise<{ error?: string }> {
  try {
    await requireAdmin()
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      return {
        error:
          "Google nevrátil refresh token. V účtu Google odeber přístup aplikaci a připoj znovu.",
      }
    }
    const email = await getProfileEmail(tokens.access_token)
    const supabase = await createClient()
    const { error } = await supabase.from("gmail_integration").upsert({
      id: 1,
      email,
      refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Připojení Gmailu selhalo" }
  }
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("gmail_integration")
    .select("email, refresh_token, label_id, label_name, last_sync_at")
    .eq("id", 1)
    .single()
  if (!data?.refresh_token) {
    return { connected: false, email: null, labelId: null, labelName: null, lastSyncAt: null }
  }
  return {
    connected: true,
    email: data.email ?? null,
    labelId: data.label_id ?? null,
    labelName: data.label_name ?? null,
    lastSyncAt: data.last_sync_at ?? null,
  }
}

async function accessTokenFromStore(supabase: Supabase): Promise<string> {
  const { data } = await supabase
    .from("gmail_integration")
    .select("refresh_token")
    .eq("id", 1)
    .single()
  if (!data?.refresh_token) throw new GmailAuthError("Gmail není připojen")
  return refreshAccessToken(data.refresh_token)
}

export async function listGmailLabels(): Promise<{
  labels?: GmailLabel[]
  error?: string
  needsReconnect?: boolean
}> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }
  const supabase = await createClient()
  try {
    const token = await accessTokenFromStore(supabase)
    const labels = await listLabels(token)
    return {
      labels: labels
        .filter((l) => l.type === "user")
        .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    }
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return { error: "Přístup vypršel, připoj Gmail znovu.", needsReconnect: true }
    }
    return { error: err instanceof Error ? err.message : "Nepodařilo se načíst labely" }
  }
}

export async function setGmailLabel(labelId: string, labelName: string): Promise<{ error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("gmail_integration")
    .update({ label_id: labelId, label_name: labelName, updated_at: new Date().toISOString() })
    .eq("id", 1)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  revalidatePath("/costs")
  return {}
}

export async function disconnectGmail(): Promise<{ error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("gmail_integration").delete().eq("id", 1)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  revalidatePath("/costs")
  return {}
}

// Zjistí, které zprávy se mají zpracovat.
// - Máme historyId → inkrementální dotaz (jen labelAdded/messagesAdded od minule).
//   Vypršel-li (404), spadneme na plný resync.
// - Nemáme historyId (první běh) → plný resync labelu, omezený `fullResyncQuery`
//   (např. `after:2026/1/1`, aby se netahaly starší roky).
// `nextHistoryId` = kam posunout kotvu PO čistém běhu (bez chyb).
async function resolveCandidateMessages(
  token: string,
  labelId: string,
  historyId: string | null,
  fullResyncQuery?: string
): Promise<{ messageIds: string[]; nextHistoryId: string | null }> {
  if (historyId) {
    try {
      const h = await listHistory(token, historyId, labelId)
      return { messageIds: h.messageIds, nextHistoryId: h.latestHistoryId ?? historyId }
    } catch (err) {
      if (!(err instanceof GmailHistoryExpiredError)) throw err
      // historyId je moc starý → plný resync (kotvu ber PŘED listováním).
    }
  }
  const nextHistoryId = await getProfileHistoryId(token)
  const messageIds = await listAllMessageIds(token, labelId, fullResyncQuery)
  return { messageIds, nextHistoryId }
}

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

  // Bereme jen faktury z aktuálního kalendářního roku (podle data přijetí).
  const currentYear = new Date().getFullYear()

  let messageIds: string[]
  let nextHistoryId: string | null
  try {
    const resolved = await resolveCandidateMessages(
      token,
      integ.label_id,
      integ.history_id ?? null,
      `after:${currentYear}/1/1`
    )
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
      // Pojistka i pro inkrementální/history cestu (ta dotaz `after:` nemá).
      if (!isFromYear(message.internalDate, currentYear)) continue
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

// Jednorázově doplní datum přijetí u již naimportovaných Gmail nákladů podle
// data původního e-mailu (internalDate).
export async function backfillGmailReceivedDates(): Promise<{
  updated: number
  errors: string[]
  error?: string
  needsReconnect?: boolean
}> {
  try {
    await requireAdmin()
  } catch (e) {
    return { updated: 0, errors: [], error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }

  const supabase = await createClient()
  const { data: integ } = await supabase
    .from("gmail_integration")
    .select("refresh_token")
    .eq("id", 1)
    .single()
  if (!integ?.refresh_token) return { updated: 0, errors: [], error: "Gmail není připojen" }

  let token: string
  try {
    token = await refreshAccessToken(integ.refresh_token)
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return { updated: 0, errors: [], needsReconnect: true, error: "Přístup vypršel, připoj Gmail znovu." }
    }
    return { updated: 0, errors: [], error: err instanceof Error ? err.message : "Chyba přístupu" }
  }

  const { data: rows } = await supabase
    .from("gmail_processed")
    .select("message_id, cost_id")
    .not("cost_id", "is", null)

  // Zprávu stáhneme jen jednou, i když má víc příloh/nákladů.
  const byMessage = new Map<string, string[]>()
  for (const r of rows ?? []) {
    if (!r.cost_id) continue
    const arr = byMessage.get(r.message_id) ?? []
    arr.push(r.cost_id)
    byMessage.set(r.message_id, arr)
  }

  let updated = 0
  const errors: string[] = []
  for (const [messageId, costIds] of byMessage) {
    try {
      const message = await getMessage(token, messageId)
      const received = receivedDateFromMessage(message.internalDate)
      const { error } = await supabase
        .from("costs")
        .update({ received_date: received, updated_at: new Date().toISOString() })
        .in("id", costIds)
      if (error) errors.push(`${messageId}: ${error.message}`)
      else updated += costIds.length
    } catch (err) {
      errors.push(`${messageId}: ${err instanceof Error ? err.message : "chyba"}`)
    }
  }

  revalidatePath("/costs")
  revalidatePath("/")
  return { updated, errors }
}
