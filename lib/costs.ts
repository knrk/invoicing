"use server"

import {
  type Cost,
  type CostFormData,
  CostFormDataSchema,
  CostSchema,
  formatZodError,
} from "@/lib/schemas"
import { createClient } from "@/lib/supabase/server"
import { upsertSupplierByIco } from "@/lib/suppliers"
import JSZip from "jszip"
import { revalidatePath } from "next/cache"

const BUCKET = "costs"

// DB ukládá prázdné datum jako NULL; formulář pracuje s "".
function emptyToNull<T>(v: T | ""): T | null {
  return v === "" ? null : (v as T)
}

function toDbRow(form: CostFormData) {
  return {
    supplier: form.supplier,
    invoice_number: form.invoice_number,
    variable_symbol: form.variable_symbol,
    currency: form.currency,
    issue_date: emptyToNull(form.issue_date),
    due_date: emptyToNull(form.due_date),
    received_date: emptyToNull(form.received_date),
    total: form.total,
    vat_amount: form.vat_amount,
    reverse_charge: form.reverse_charge,
    is_eu_supplier: form.is_eu_supplier,
    note: form.note,
    source: form.source,
  }
}

// DB row → Cost (NULL data → "" aby prošla CostSchema).
function rowToCost(row: Record<string, unknown>): Cost | null {
  const normalized = {
    ...row,
    issue_date: row.issue_date ?? "",
    due_date: row.due_date ?? "",
    received_date: row.received_date ?? "",
  }
  const parsed = CostSchema.safeParse(normalized)
  return parsed.success ? parsed.data : null
}

export async function getCosts(): Promise<Cost[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("costs")
    .select("*")
    .order("created_at", { ascending: false })
  if (error || !data) return []
  return data.flatMap((row) => {
    const c = rowToCost(row)
    return c ? [c] : []
  })
}

export async function getCost(id: string): Promise<Cost | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("costs").select("*").eq("id", id).single()
  if (error || !data) return null
  return rowToCost(data)
}

export async function createCost(form: CostFormData): Promise<{ data?: Cost; error?: string }> {
  const parsed = CostFormDataSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("costs")
    .insert({ ...toDbRow(parsed.data), created_at: now, updated_at: now })
    .select()
    .single()
  if (error) return { error: error.message }

  const cost = rowToCost(data)
  if (!cost) return { error: "Unexpected response from database" }
  await upsertSupplierByIco(parsed.data.supplier)
  revalidatePath("/costs")
  revalidatePath("/")
  return { data: cost }
}

export async function updateCost(id: string, form: CostFormData): Promise<{ error?: string }> {
  const parsed = CostFormDataSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("costs")
    .update({ ...toDbRow(parsed.data), updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  await upsertSupplierByIco(parsed.data.supplier)
  revalidatePath("/costs")
  revalidatePath(`/costs/${id}`)
  revalidatePath("/")
  return {}
}

export async function setCostPaidAt(id: string, paidAt: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("costs")
    .update({ paid_at: paidAt, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/costs")
  revalidatePath("/")
  return {}
}

export async function deleteCost(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase.from("costs").select("file_path").eq("id", id).single()
  const { error } = await supabase.from("costs").delete().eq("id", id)
  if (error) return { error: error.message }
  if (existing?.file_path) {
    await supabase.storage.from(BUCKET).remove([existing.file_path])
  }
  revalidatePath("/costs")
  revalidatePath("/")
  return {}
}

// Supabase Storage klíče nepovolují diakritiku a řadu znaků ("Invalid key").
// Odstraníme diakritiku a nepovolené znaky; původní název zůstává v DB (file_name).
function toStorageName(name: string): string {
  const ascii = name.normalize("NFD").replace(/\p{M}/gu, "")
  const cleaned = ascii.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_")
  return cleaned.replace(/^_+|_+$/g, "") || "document.pdf"
}

export async function deleteCosts(ids: string[]): Promise<{ deleted: number; error?: string }> {
  if (ids.length === 0) return { deleted: 0 }
  const supabase = await createClient()

  const { data: rows } = await supabase.from("costs").select("file_path").in("id", ids)
  const { error } = await supabase.from("costs").delete().in("id", ids)
  if (error) return { deleted: 0, error: error.message }

  const paths = (rows ?? [])
    .map((r) => r.file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths)
  }

  revalidatePath("/costs")
  revalidatePath("/")
  return { deleted: ids.length }
}

export async function uploadCostFile(
  costId: string,
  fileName: string,
  base64: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const path = `${costId}/${toStorageName(fileName)}`
  const bytes = Buffer.from(base64, "base64")
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true })
  if (upErr) return { error: upErr.message }

  const { error } = await supabase
    .from("costs")
    .update({ file_path: path, file_name: fileName, updated_at: new Date().toISOString() })
    .eq("id", costId)
  if (error) return { error: error.message }
  revalidatePath("/costs")
  revalidatePath(`/costs/${costId}`)
  return {}
}

export async function getCostFileUrl(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: row } = await supabase.from("costs").select("file_path").eq("id", id).single()
  if (!row?.file_path) return { error: "Soubor není k dispozici" }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 300)
  if (error || !data) return { error: error?.message ?? "Nepodařilo se vytvořit odkaz" }
  return { url: data.signedUrl }
}

// --- Export pro účetního ------------------------------------------------

const CSV_HEADER = [
  "Dodavatel",
  "IČ",
  "DIČ",
  "Číslo faktury",
  "VS",
  "Datum vystavení",
  "Splatnost",
  "Měna",
  "Celkem",
  "DPH",
  "Zaplaceno",
]

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export async function buildCostsCsv(costs: Cost[]): Promise<string> {
  const rows = costs.map((c) =>
    [
      c.supplier.name,
      c.supplier.ico,
      c.supplier.dic,
      c.invoice_number,
      c.variable_symbol,
      c.issue_date,
      c.due_date,
      c.currency,
      c.total,
      c.vat_amount ?? "",
      c.paid_at ? "ano" : "ne",
    ]
      .map(csvCell)
      .join(";")
  )
  // UTF-8 BOM (﻿) kvůli českému Excelu.
  return `﻿${[CSV_HEADER.map(csvCell).join(";"), ...rows].join("\r\n")}`
}

function inPeriod(cost: Cost, period: string): boolean {
  if (!period) return true
  return cost.issue_date.startsWith(period)
}

export async function exportCostsCsv(period = ""): Promise<{ csv: string; filename: string }> {
  const all = await getCosts()
  const filtered = all.filter((c) => inPeriod(c, period))
  const suffix = period || "vse"
  return { csv: await buildCostsCsv(filtered), filename: `naklady-${suffix}.csv` }
}

export async function exportCostsZip(
  period = ""
): Promise<{ base64?: string; filename: string; error?: string }> {
  const supabase = await createClient()
  const all = await getCosts()
  const filtered = all.filter((c) => inPeriod(c, period) && c.file_path)
  const zip = new JSZip()
  for (const c of filtered) {
    if (!c.file_path) continue
    const { data } = await supabase.storage.from(BUCKET).download(c.file_path)
    if (!data) continue
    const buf = Buffer.from(await data.arrayBuffer())
    const name = c.file_name ?? `${c.id}.pdf`
    zip.file(name, buf)
  }
  const base64 = await zip.generateAsync({ type: "base64" })
  const suffix = period || "vse"
  return { base64, filename: `naklady-prilohy-${suffix}.zip` }
}
