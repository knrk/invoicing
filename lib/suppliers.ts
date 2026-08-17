"use server"

import {
  formatZodError,
  type SupplierRecord,
  type SupplierRecordForm,
  SupplierRecordFormSchema,
  SupplierRecordSchema,
} from "@/lib/schemas"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getSuppliers(): Promise<SupplierRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true })
  if (error || !data) return []
  return data.flatMap((row) => {
    const parsed = SupplierRecordSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

export async function createSupplier(
  form: SupplierRecordForm
): Promise<{ data?: SupplierRecord; error?: string }> {
  const parsed = SupplierRecordFormSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...parsed.data, created_at: now, updated_at: now })
    .select()
    .single()
  if (error) return { error: error.message }

  const result = SupplierRecordSchema.safeParse(data)
  if (!result.success) return { error: "Unexpected response from database" }
  revalidatePath("/suppliers")
  return { data: result.data }
}

export async function updateSupplier(
  id: string,
  form: SupplierRecordForm
): Promise<{ error?: string }> {
  const parsed = SupplierRecordFormSchema.safeParse(form)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase
    .from("suppliers")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/suppliers")
  return {}
}

export async function deleteSupplier(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("suppliers").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/suppliers")
  return {}
}

// Auto-uložení dodavatele z nákladu: podle IČ vloží nebo aktualizuje záznam.
// Toleruje chyby (nesmí shodit uložení nákladu) a vyžaduje neprázdné IČ + název.
export async function upsertSupplierByIco(supplier: {
  name: string
  ico: string
  dic: string
  street: string
  zip: string
  city: string
  country: string
}): Promise<void> {
  const ico = supplier.ico.trim()
  const name = supplier.name.trim()
  if (!ico || !name) return

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("ico", ico)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await supabase
      .from("suppliers")
      .update({ ...supplier, ico, name, updated_at: now })
      .eq("id", existing.id)
  } else {
    await supabase.from("suppliers").insert({ ...supplier, ico, name, created_at: now, updated_at: now })
  }
  revalidatePath("/suppliers")
}
