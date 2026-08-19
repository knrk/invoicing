"use server"

import { addDays, today } from "@/lib/invoice"
import {
  type AppConfig,
  AppConfigSchema,
  type CustomerRecord,
  type CustomerRecordForm,
  CustomerRecordFormSchema,
  CustomerRecordSchema,
  type Invoice,
  type InvoiceFormData,
  InvoiceFormDataSchema,
  InvoiceSchema,
  formatZodError,
} from "@/lib/schemas"
import {
  buildVatRecapStatementData,
  buildVatRecapStatementFilename,
  generateVatRecapStatementXml,
  type VatRecapStatementData,
} from "@/lib/vat-recapitulative-statement"
import { createClient } from "@/lib/supabase/server"
import { yearFromDate } from "@/lib/year-filter"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"

export async function getConfig(): Promise<AppConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("config").select("*").eq("id", 1).single()
  if (error || !data) return null

  const parsed = AppConfigSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function saveConfig(
  config: Omit<AppConfig, "id" | "updated_at">
): Promise<{ error?: string }> {
  const parsed = AppConfigSchema.omit({ id: true, updated_at: true }).safeParse(config)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("config").upsert({
    id: 1,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }

  revalidatePath("/settings")
  revalidatePath("/")
  revalidatePath("/invoice/new")
  return {}
}

export async function getInvoicesResult(): Promise<{ invoices: Invoice[]; error: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
  if (error || !data) return { invoices: [], error: true }
  const invoices = data.flatMap((row) => {
    const parsed = InvoiceSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
  return { invoices, error: false }
}

export async function getInvoices(): Promise<Invoice[]> {
  return (await getInvoicesResult()).invoices
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).single()
  if (error || !data) return null
  const parsed = InvoiceSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

async function nextSeq(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${year}%`)
    .order("invoice_number", { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 1
  const seqStr = data[0].invoice_number.slice(4)
  const seq = Number.parseInt(seqStr, 10)
  return Number.isNaN(seq) ? 1 : seq + 1
}

export async function getNextInvoiceSequence(): Promise<number> {
  const supabase = await createClient()
  return nextSeq(supabase)
}

export async function createInvoice(
  formData: InvoiceFormData
): Promise<{ data?: Invoice; error?: string }> {
  const parsed = InvoiceFormDataSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  const supabase = await createClient()

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("invoices")
    .insert({ ...parsed.data, created_at: now, updated_at: now })
    .select()
    .single()

  if (error) return { error: error.message }

  const invoiceParsed = InvoiceSchema.safeParse(data)
  if (!invoiceParsed.success) return { error: "Unexpected response from database" }

  revalidatePath("/")
  return { data: invoiceParsed.data }
}

export async function updateInvoice(
  id: string,
  formData: InvoiceFormData
): Promise<{ error?: string }> {
  const parsed = InvoiceFormDataSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("invoices")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/")
  revalidatePath(`/invoice/${id}`)
  return {}
}

export async function deleteInvoice(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("invoices").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

export async function setInvoicePaidAt(
  id: string,
  paidAt: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("invoices")
    .update({ paid_at: paidAt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

export async function getCustomers(): Promise<CustomerRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true })
  if (error || !data) return []
  return data.flatMap((row) => {
    const parsed = CustomerRecordSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

export async function createCustomer(
  form: CustomerRecordForm
): Promise<{ data?: CustomerRecord; error?: string }> {
  const parsed = CustomerRecordFormSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed.data, created_at: now, updated_at: now })
    .select()
    .single()

  if (error) return { error: error.message }
  const result = CustomerRecordSchema.safeParse(data)
  if (!result.success) return { error: "Unexpected response from database" }

  revalidatePath("/customers")
  return { data: result.data }
}

export async function updateCustomer(
  id: string,
  form: CustomerRecordForm
): Promise<{ error?: string }> {
  const parsed = CustomerRecordFormSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("customers")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/customers")
  return {}
}

export async function deleteCustomer(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("customers").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/customers")
  return {}
}

export async function getVatRecapStatementData(
  rok: number,
  mesic: number
): Promise<{ data?: VatRecapStatementData; error?: string }> {
  const invoices = await getInvoices()
  try {
    const data = await buildVatRecapStatementData(invoices, rok, mesic)
    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Chyba při načítání dat" }
  }
}

export async function exportVatRecapStatementXml(
  rok: number,
  mesic: number
): Promise<{ xml?: string; filename?: string; error?: string }> {
  const [invoices, config] = await Promise.all([getInvoices(), getConfig()])
  if (!config) return { error: "Chybí konfigurace" }

  try {
    const data = await buildVatRecapStatementData(invoices, rok, mesic)
    const now = new Date()
    const filename = buildVatRecapStatementFilename(config, now)
    const xml = generateVatRecapStatementXml(data, config, filename)
    return { xml, filename: `${filename}.xml` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Chyba při generování XML" }
  }
}

export async function duplicateInvoice(id: string): Promise<{ data?: Invoice; error?: string }> {
  const supabase = await createClient()

  const { data: originalRaw, error: fetchError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single()

  if (fetchError || !originalRaw) return { error: "Invoice not found" }

  const originalParsed = InvoiceSchema.safeParse(originalRaw)
  if (!originalParsed.success) return { error: "Invalid invoice data" }
  const original = originalParsed.data

  const { data: configData } = await supabase.from("config").select("invoice").eq("id", 1).single()

  const year = new Date().getFullYear()
  const newSeq = await nextSeq(supabase)
  const newNumber = `${year}${String(newSeq).padStart(2, "0")}`

  const issueDate = today()
  const dueDays =
    original.language === "cs"
      ? (configData?.invoice?.default_due_days_czk ?? 7)
      : (configData?.invoice?.default_due_days_eur ?? 14)
  const dueDate = addDays(issueDate, dueDays)

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      ...original,
      id: undefined,
      invoice_number: newNumber,
      variable_symbol: newNumber,
      issue_date: issueDate,
      due_date: dueDate,
      paid_at: null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  const parsed = InvoiceSchema.safeParse(data)
  if (!parsed.success) return { error: "Unexpected response from database" }

  revalidatePath("/")
  return { data: parsed.data }
}

export async function sendInvoiceEmail(params: {
  to: string
  subject: string
  body: string
  pdfBase64: string
  filename: string
}): Promise<{ error?: string }> {
  const { to, subject, body, pdfBase64, filename } = params

  const apiKey = process.env.RESEND_API_KEY
  const fromAddress = process.env.RESEND_FROM
  if (!apiKey) return { error: "Chybí RESEND_API_KEY v nastavení serveru." }
  if (!fromAddress) return { error: "Chybí RESEND_FROM v nastavení serveru." }
  if (!to.trim()) return { error: "Chybí e-mail příjemce." }

  const config = await getConfig()
  const supplierName = config?.supplier.name ?? ""
  const supplierEmail = config?.supplier.email || undefined
  const from = supplierName ? `${supplierName} <${fromAddress}>` : fromAddress

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text: body,
      replyTo: supplierEmail,
      bcc: supplierEmail,
      attachments: [{ filename, content: Buffer.from(pdfBase64, "base64") }],
    })
    if (error) return { error: error.message }
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Nepodařilo se odeslat e-mail." }
  }
}

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
