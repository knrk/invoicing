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

// Auto-uložení dodavatele z nákladu: identifikuje podle IČ, a když chybí (typicky
// zahraniční dodavatel), tak podle DIČ (VAT ID). Toleruje chyby (nesmí shodit
// uložení nákladu). Vyžaduje název + alespoň jeden identifikátor (IČ nebo DIČ).
export async function upsertSupplierFromCost(supplier: {
  name: string
  ico: string
  dic: string
  street: string
  zip: string
  city: string
  country: string
}): Promise<void> {
  const ico = supplier.ico.trim()
  const dic = supplier.dic.trim()
  const name = supplier.name.trim()
  if (!name || (!ico && !dic)) return

  const supabase = await createClient()
  const now = new Date().toISOString()

  let existingId: string | undefined
  if (ico) {
    const { data } = await supabase
      .from("suppliers")
      .select("id")
      .eq("ico", ico)
      .limit(1)
      .maybeSingle()
    existingId = data?.id
  }
  if (!existingId && dic) {
    const { data } = await supabase
      .from("suppliers")
      .select("id")
      .eq("dic", dic)
      .limit(1)
      .maybeSingle()
    existingId = data?.id
  }

  if (existingId) {
    await supabase
      .from("suppliers")
      .update({ ...supplier, ico, dic, name, updated_at: now })
      .eq("id", existingId)
  } else {
    await supabase
      .from("suppliers")
      .insert({ ...supplier, ico, dic, name, created_at: now, updated_at: now })
  }
  revalidatePath("/suppliers")
}
