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
