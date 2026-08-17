import { z } from "zod"

const LanguageSchema = z.enum(["cs", "en"])
const CurrencySchema = z.enum(["CZK", "EUR"])

const SupplierConfigSchema = z.object({
  name: z.string().min(1, "Jméno dodavatele je povinné"),
  ico: z.string().min(1, "IČ je povinné"),
  dic: z.string().default(""),
  street: z.string().min(1, "Ulice je povinná"),
  zip: z.string().min(1, "PSČ je povinné"),
  city: z.string().min(1, "Město je povinné"),
  phone: z.string().default(""),
  email: z.string().email("Neplatný e-mail").or(z.literal("")).default(""),
  web1: z.string().default(""),
  web2: z.string().default(""),
})

const BankingConfigSchema = z.object({
  account_czk: z.string().default(""),
  account_eur_iban: z.string().default(""),
  account_eur_bic: z.string().default(""),
  constant_symbol: z.string().default("0308"),
})

const InvoiceConfigSchema = z.object({
  default_due_days_czk: z.number().int().min(1).max(365).default(7),
  default_due_days_eur: z.number().int().min(1).max(365).default(14),
})

const FooterConfigSchema = z.object({
  penalty_cs: z.string().default(""),
  penalty_en: z.string().default(""),
  note_cs: z.string().default(""),
  note_en: z.string().default(""),
})

const TaxConfigSchema = z.object({
  c_ufo: z.string().default(""),
  c_pracufo: z.string().default(""),
  typ_ds: z.string().default("F"),
  prijmeni: z.string().default(""),
  jmeno: z.string().default(""),
  sest_telef: z.string().default(""),
})

export const AppConfigSchema = z.object({
  id: z.number().optional(),
  supplier: SupplierConfigSchema,
  banking: BankingConfigSchema,
  invoice: InvoiceConfigSchema,
  footer: FooterConfigSchema,
  tax: TaxConfigSchema.default({ c_ufo: "", c_pracufo: "", typ_ds: "F", prijmeni: "", jmeno: "", sest_telef: "" }),
  updated_at: z.string().optional(),
})

export type AppConfig = z.infer<typeof AppConfigSchema>
type SupplierConfig = z.infer<typeof SupplierConfigSchema>
type BankingConfig = z.infer<typeof BankingConfigSchema>
type InvoiceConfig = z.infer<typeof InvoiceConfigSchema>
type FooterConfig = z.infer<typeof FooterConfigSchema>
type TaxConfig = z.infer<typeof TaxConfigSchema>

const CustomerSchema = z.object({
  name: z.string().min(1, "Název odběratele je povinný"),
  ico: z.string().default(""),
  dic: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("CZ"),
})

const InvoiceLineSchema = z.object({
  id: z.string(),
  description: z.string().min(1, "Popis položky je povinný"),
  sub_description: z.string().default(""),
  is_advance: z.boolean().default(false),
  quantity: z.number().min(0).default(0),
  unit: z.string().default(""),
  unit_price: z.number().min(0, "Cena nesmí být záporná"),
  total: z.number(),
})

export const InvoiceFormDataSchema = z.object({
  invoice_number: z.string().min(1, "Číslo faktury je povinné"),
  language: LanguageSchema,
  currency: CurrencySchema,
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum"),
  payment_method: z.string().min(1, "Způsob platby je povinný"),
  variable_symbol: z.string().default(""),
  reverse_charge: z.boolean().default(false),
  customer: CustomerSchema,
  lines: z.array(InvoiceLineSchema).min(1, "Faktura musí mít alespoň jednu položku"),
  total: z.number(),
})

export const InvoiceSchema = InvoiceFormDataSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  paid_at: z.string().nullable().default(null),
})

export const CustomerRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Název odběratele je povinný"),
  ico: z.string().default(""),
  dic: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("CZ"),
  email: z.string().email("Neplatný e-mail").or(z.literal("")).default(""),
  language: LanguageSchema,
  currency: CurrencySchema,
  payment_method: z.string().default(""),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export const CustomerRecordFormSchema = CustomerRecordSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})

// Evidence dodavatelů (obdoba odběratelů, k přepoužití + reportům).
export const SupplierRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Název dodavatele je povinný"),
  ico: z.string().default(""),
  dic: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("CZ"),
  email: z.string().email("Neplatný e-mail").or(z.literal("")).default(""),
  note: z.string().default(""),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export const SupplierRecordFormSchema = SupplierRecordSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})

// Náklady (příchozí faktury). Dodavatel je záměrně volnější než u faktur —
// u Gmail importu nemusí být jméno hned známé.
const CostSupplierSchema = z.object({
  name: z.string().default(""),
  ico: z.string().default(""),
  dic: z.string().default(""),
  street: z.string().default(""),
  zip: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("CZ"),
})

const OptionalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum")
  .or(z.literal(""))
  .default("")

export const CostFormDataSchema = z.object({
  supplier: CostSupplierSchema,
  invoice_number: z.string().default(""),
  variable_symbol: z.string().default(""),
  currency: CurrencySchema.default("CZK"),
  issue_date: OptionalDateSchema,
  due_date: OptionalDateSchema,
  received_date: OptionalDateSchema,
  total: z.number().min(0).default(0),
  vat_amount: z.number().min(0).nullable().default(null),
  reverse_charge: z.boolean().default(false),
  is_eu_supplier: z.boolean().default(false),
  note: z.string().default(""),
  source: z.enum(["upload", "gmail"]).default("upload"),
})

export const CostSchema = CostFormDataSchema.extend({
  id: z.string().uuid(),
  paid_at: z.string().nullable().default(null),
  file_path: z.string().nullable().default(null),
  file_name: z.string().nullable().default(null),
  extraction: z.unknown().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Language = z.infer<typeof LanguageSchema>
export type Currency = z.infer<typeof CurrencySchema>
type Customer = z.infer<typeof CustomerSchema>
export type CustomerRecord = z.infer<typeof CustomerRecordSchema>
export type CustomerRecordForm = z.infer<typeof CustomerRecordFormSchema>
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>
export type InvoiceFormData = z.infer<typeof InvoiceFormDataSchema>
export type Invoice = z.infer<typeof InvoiceSchema>
export type CostFormData = z.infer<typeof CostFormDataSchema>
export type Cost = z.infer<typeof CostSchema>
export type SupplierRecord = z.infer<typeof SupplierRecordSchema>
export type SupplierRecordForm = z.infer<typeof SupplierRecordFormSchema>

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(", ")
}
