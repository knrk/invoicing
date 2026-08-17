"use server"

import { createCost, uploadCostFile } from "@/lib/costs"
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  extractHtmlBody,
  extractPdfAttachments,
  getAttachmentBase64,
  getHeader,
  getMessage,
  getProfileEmail,
  GmailAuthError,
  type GmailLabel,
  type GmailStatus,
  type GmailSyncResult,
  listLabels,
  listMessageIds,
  refreshAccessToken,
} from "@/lib/gmail-api"
import { today } from "@/lib/invoice"
import type { CostFormData } from "@/lib/schemas"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

type Supabase = Awaited<ReturnType<typeof createClient>>

// Datum přijetí e-mailu (internalDate = ms epoch) → "YYYY-MM-DD" (lokálně).
function receivedDateFromMessage(internalDate: string | undefined): string {
  if (!internalDate) return today()
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return today()
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function gmailCostForm(note: string, receivedDate: string): CostFormData {
  return {
    supplier: { name: "", ico: "", dic: "", street: "", zip: "", city: "", country: "CZ" },
    invoice_number: "",
    variable_symbol: "",
    currency: "CZK",
    issue_date: "",
    due_date: "",
    received_date: receivedDate,
    total: 0,
    vat_amount: null,
    reverse_charge: false,
    is_eu_supplier: false,
    note,
    source: "gmail",
  }
}

export async function getGmailAuthUrl(): Promise<string> {
  return buildAuthUrl()
}

// Volané z callback route po návratu z Google consent.
export async function connectGmail(code: string): Promise<{ error?: string }> {
  try {
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
  const supabase = await createClient()
  const { error } = await supabase.from("gmail_integration").delete().eq("id", 1)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  revalidatePath("/costs")
  return {}
}

// Stáhne nové PDF přílohy ze zvoleného labelu a založí z nich náklady.
// Čistá funkce volatelná z tlačítka i z budoucího Vercel Cronu.
export async function syncGmailCosts(): Promise<GmailSyncResult> {
  const supabase = await createClient()
  const { data: integ } = await supabase
    .from("gmail_integration")
    .select("refresh_token, label_id")
    .eq("id", 1)
    .single()
  if (!integ?.refresh_token) {
    return { imported: 0, skipped: 0, errors: [], error: "Gmail není připojen" }
  }
  if (!integ.label_id) {
    return { imported: 0, skipped: 0, errors: [], error: "Není zvolený label" }
  }

  let token: string
  try {
    token = await refreshAccessToken(integ.refresh_token)
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return {
        imported: 0,
        skipped: 0,
        errors: [],
        needsReconnect: true,
        error: "Přístup vypršel, připoj Gmail znovu.",
      }
    }
    return {
      imported: 0,
      skipped: 0,
      errors: [],
      error: err instanceof Error ? err.message : "Chyba přístupu ke Gmailu",
    }
  }

  const { data: processedRows } = await supabase
    .from("gmail_processed")
    .select("message_id, attachment_id")
  const processed = new Set(
    (processedRows ?? []).map((r) => `${r.message_id}:${r.attachment_id}`)
  )

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Jen e-maily z aktuálního kalendářního roku.
  const year = new Date().getFullYear()
  let messageIds: string[]
  try {
    messageIds = await listMessageIds(token, integ.label_id, `after:${year}/01/01`)
  } catch (err) {
    return {
      imported,
      skipped,
      errors,
      error: err instanceof Error ? err.message : "Nepodařilo se načíst zprávy",
    }
  }

  for (const msgId of messageIds) {
    try {
      const message = await getMessage(token, msgId)
      const from = getHeader(message, "From")
      const subject = getHeader(message, "Subject")
      const received = receivedDateFromMessage(message.internalDate)
      const note = `Z Gmailu — ${subject || "(bez předmětu)"} — ${from}`
      const pdfs = extractPdfAttachments(message)

      if (pdfs.length > 0) {
        for (const pdf of pdfs) {
          const key = `${msgId}:${pdf.attachmentId}`
          if (processed.has(key)) {
            skipped++
            continue
          }
          const base64 = await getAttachmentBase64(token, msgId, pdf.attachmentId)
          const created = await createCost(gmailCostForm(note, received))
          if (created.error || !created.data) {
            errors.push(`${pdf.filename}: ${created.error ?? "vytvoření selhalo"}`)
            continue
          }
          const up = await uploadCostFile(created.data.id, pdf.filename, base64)
          if (up.error) errors.push(`${pdf.filename}: ${up.error}`)
          await supabase.from("gmail_processed").insert({
            message_id: msgId,
            attachment_id: pdf.attachmentId,
            cost_id: created.data.id,
          })
          processed.add(key)
          imported++
        }
      } else {
        // Bez PDF přílohy → faktura je v těle e-mailu (HTML), např. Apple.
        const key = `${msgId}:body`
        if (processed.has(key)) {
          skipped++
          continue
        }
        const html = extractHtmlBody(message)
        if (!html) continue
        const created = await createCost(gmailCostForm(note, received))
        if (created.error || !created.data) {
          errors.push(`${subject || msgId}: ${created.error ?? "vytvoření selhalo"}`)
          continue
        }
        const base64 = Buffer.from(html, "utf8").toString("base64")
        const up = await uploadCostFile(
          created.data.id,
          "faktura.html",
          base64,
          "text/html; charset=utf-8"
        )
        if (up.error) errors.push(`${subject || msgId}: ${up.error}`)
        await supabase.from("gmail_processed").insert({
          message_id: msgId,
          attachment_id: "body",
          cost_id: created.data.id,
        })
        processed.add(key)
        imported++
      }
    } catch (err) {
      errors.push(`Zpráva ${msgId}: ${err instanceof Error ? err.message : "chyba"}`)
    }
  }

  await supabase
    .from("gmail_integration")
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", 1)
  revalidatePath("/costs")
  revalidatePath("/")
  revalidatePath("/settings")
  return { imported, skipped, errors }
}

// Jednorázově doplní datum přijetí u již naimportovaných Gmail nákladů podle
// data původního e-mailu (internalDate).
export async function backfillGmailReceivedDates(): Promise<{
  updated: number
  errors: string[]
  error?: string
  needsReconnect?: boolean
}> {
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
