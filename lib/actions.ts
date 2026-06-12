"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  AppConfigSchema,
  InvoiceFormDataSchema,
  InvoiceSchema,
  CustomerRecordSchema,
  CustomerRecordFormSchema,
  formatZodError,
  type AppConfig,
  type Invoice,
  type InvoiceFormData,
  type CustomerRecord,
  type CustomerRecordForm,
} from "@/lib/schemas"

// ── Config ────────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("config")
    .select("*")
    .eq("id", 1)
    .single()
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

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data.flatMap((row) => {
    const parsed = InvoiceSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !data) return null
  const parsed = InvoiceSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function createInvoice(
  formData: InvoiceFormData
): Promise<{ data?: Invoice; error?: string }> {
  const parsed = InvoiceFormDataSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  const supabase = await createClient()

  // Atomically increment sequence via RPC
  await supabase.rpc("increment_invoice_sequence")

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

// ── Customers ─────────────────────────────────────────────────────────────────

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

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function duplicateInvoice(
  id: string
): Promise<{ data?: Invoice; error?: string }> {
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

  // Step 1: atomically increment and get the new sequence directly from RPC
  // (avoids a separate SELECT that could race with another concurrent call)
  const { data: newSeq, error: rpcError } = await supabase.rpc("increment_invoice_sequence")
  if (rpcError || newSeq == null) return { error: rpcError?.message ?? "Failed to increment sequence" }

  // Step 2: fetch config for prefix and due-days (no race concern here)
  const { data: configData } = await supabase
    .from("config")
    .select("invoice")
    .eq("id", 1)
    .single()

  const prefix =
    original.language === "cs"
      ? configData?.invoice?.prefix_czk ?? "FV"
      : configData?.invoice?.prefix_eur ?? "IN"
  const year = new Date().getFullYear()
  const newNumber = `${prefix}${year}${String(newSeq).padStart(2, "0")}`

  // Use local-date helpers to avoid UTC off-by-one
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const issueDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const dueDays =
    original.language === "cs"
      ? configData?.invoice?.default_due_days_czk ?? 7
      : configData?.invoice?.default_due_days_eur ?? 14

  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dueDays)
  const dueDate = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      ...original,
      id: undefined,
      invoice_number: newNumber,
      issue_date: issueDate,
      due_date: dueDate,
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
