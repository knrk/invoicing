import type { AppConfig, Language, Currency } from "@/types"

export function getCurrency(language: Language): Currency {
  return language === "cs" ? "CZK" : "EUR"
}

export function getDueDays(language: Language, config: AppConfig): number {
  return language === "cs"
    ? config.invoice.default_due_days_czk
    : config.invoice.default_due_days_eur
}

export function buildInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear()
  return `${year}${String(sequence).padStart(2, "0")}`
}

export function formatDate(dateStr: string, language: Language): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (language === "cs") {
    return `${d}. ${m}. ${y}`
  }
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return localDateStr(date)
}

export function today(): string {
  return localDateStr(new Date())
}

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("cs-CZ").format(n)
}

export function ibanToCzDomestic(iban: string): string {
  const s = iban.trim().replace(/\s/g, "").toUpperCase()
  if (!/^CZ\d{22}$/.test(s)) return iban // not a Czech IBAN — return unchanged
  const bankcode = s.slice(4, 8)
  const prefix   = String(parseInt(s.slice(8, 14), 10))
  const number   = String(parseInt(s.slice(14, 24), 10))
  return prefix === "0"
    ? `${number}/${bankcode}`
    : `${prefix}-${number}/${bankcode}`
}

export type PaymentPart = { text: string; bold: boolean }

export function getPaymentParts(
  lang: Language,
  amount: string,
  account: string,
  vs: string,
  ks: string
): PaymentPart[] {
  if (lang === "cs") {
    return [
      { text: "Prosím, uhraďte částku ", bold: false },
      { text: amount, bold: true },
      { text: " na účet ", bold: false },
      { text: account, bold: true },
      { text: " s variabilním symbolem ", bold: false },
      { text: vs, bold: true },
      { text: ` a konstantním symbolem ${ks}. Pro rychlou platbu použijte QR kód.`, bold: false },
    ]
  }
  return [
    { text: "Please transfer ", bold: false },
    { text: amount, bold: true },
    { text: " to account ", bold: false },
    { text: account, bold: true },
    { text: " with reference ", bold: false },
    { text: vs, bold: true },
    { text: ". Use the QR code for quick payment.", bold: false },
  ]
}

export const LABELS = {
  cs: {
    invoice: "FAKTURA",
    invoiceNumber: "ČÍSLO FAKTURY",
    issueDate: "DATUM VYSTAVENÍ",
    dueDate: "DATUM SPLATNOSTI",
    payment: "PLATBA",
    account: "NA ÚČET",
    variableSymbol: "VARIABILNÍ SYMBOL",
    customer: "ODBĚRATEL",
    supplier: "DODAVATEL",
    description: "Označení",
    quantity: "Počet",
    unitPrice: "Cena za MJ",
    total: "Celkem",
    totalLabel: "CELKEM",
    partyIcoLabel: "IČ",
    reverseChargeNote: "",
    payByTransfer: "Převodem",
    paymentInstruction: (amount: string, account: string, vs: string, ks: string) =>
      `Prosím, uhraďte částku ${amount} na účet ${account} s variabilním symbolem ${vs} a konstantním symbolem ${ks}. Pro rychlou platbu použijte QR kód.`,
    thanks: "Děkuji za důvěru.",
    form: {
      detailsSection: "Detaily faktury",
      language: "Jazyk",
      invoiceNumber: "Číslo faktury",
      issueDate: "Datum vystavení",
      dueDate: "Datum splatnosti",
      payment: "Způsob platby",
      reverseCharge: "Přenesená daňová povinnost",
      customerSection: "Odběratel",
      customerName: "Název / Jméno",
      ico: "IČ",
      dic: "DIČ",
      street: "Ulice",
      zip: "PSČ",
      city: "Město",
      country: "Země",
      linesSection: "Položky",
      addLine: "Přidat řádek",
      descPlaceholder: "Popis položky",
      qty: "Počet",
      unit: "Jedn.",
      unitPrice: "Cena/MJ",
      total: "Celkem",
      cancel: "Zrušit",
      save: "Uložit",
      saveNew: "Uložit fakturu",
      exportPDF: "Export PDF",
      exporting: "Exportuji...",
    },
  },
  en: {
    invoice: "INVOICE",
    invoiceNumber: "INVOICE NUMBER",
    issueDate: "ISSUE DATE",
    dueDate: "DUE DATE",
    payment: "PAYMENT",
    account: "ACCOUNT",
    variableSymbol: "REFERENCE",
    customer: "CUSTOMER",
    supplier: "SUPPLIER",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit Price",
    total: "Total",
    totalLabel: "TOTAL",
    partyIcoLabel: "VAT ID",
    reverseChargeNote: "Reverse charge — VAT to be accounted for by the recipient of this service.",
    payByTransfer: "Bank transfer",
    paymentInstruction: (amount: string, account: string, vs: string, _ks: string) =>
      `Please transfer ${amount} to account ${account} with reference ${vs}. Use the QR code for quick payment.`,
    thanks: "Thank you for your trust.",
    form: {
      detailsSection: "Invoice Details",
      language: "Language",
      invoiceNumber: "Invoice Number",
      issueDate: "Issue Date",
      dueDate: "Due Date",
      payment: "Payment method",
      reverseCharge: "Reverse Charge",
      customerSection: "Customer",
      customerName: "Name / Company",
      ico: "Company ID",
      dic: "VAT ID",
      street: "Street",
      zip: "ZIP",
      city: "City",
      country: "Country",
      linesSection: "Line items",
      addLine: "Add line",
      descPlaceholder: "Item description",
      qty: "Qty",
      unit: "Unit",
      unitPrice: "Unit price",
      total: "Total",
      cancel: "Cancel",
      save: "Save",
      saveNew: "Save Invoice",
      exportPDF: "Export PDF",
      exporting: "Exporting...",
    },
  },
} as const
