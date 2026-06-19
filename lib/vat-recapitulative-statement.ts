import { createHash } from "node:crypto"
import type { AppConfig, Invoice } from "@/types"
import { getEurCzkRate } from "./cnb"

export interface VatRecapStatementRow {
  k_stat: string
  c_vat: string
  pln_pocet: number
  pln_hodnota: number // CZK, rounded to whole CZK
}

export interface ExcludedInvoice {
  invoice: Invoice
  reason: "missing_vat" | "not_eu" | "not_eur_currency"
}

export interface VatRecapStatementData {
  rok: number
  mesic: number
  rows: VatRecapStatementRow[]
  invoices: Invoice[]
  excluded: ExcludedInvoice[]
}

/**
 * EU member states (ISO 3166-1 alpha-2).
 * CZ is excluded — souhrnné hlášení covers plnění poskytnutá osobám registrovaným k DPH
 * v JINÉM členském státě EU.
 */
export const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "CY", "DE", "DK", "EE", "ES", "FI", "FR",
  "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL",
  "PL", "PT", "RO", "SE", "SI", "SK",
])

/**
 * Extracts the EU country code from a VAT ID prefix, e.g. "FR36818371742" → "FR".
 * Returns null if the prefix is not a known EU member state.
 */
function countryFromVat(vat: string): string | null {
  const prefix = vat.slice(0, 2).toUpperCase()
  return EU_MEMBER_STATES.has(prefix) ? prefix : null
}

/**
 * Returns the numeric part of a VAT ID with the 2-letter country prefix stripped,
 * e.g. "FR36818371742" → "36818371742", "36818371742" → "36818371742".
 */
function vatNumber(vat: string): string {
  const stripped = /^[A-Z]{2}/i.test(vat.slice(0, 2)) ? vat.slice(2) : vat
  return stripped.replace(/\s/g, "")
}

/**
 * Build grouped souhrnné hlášení data for a given year/month.
 * Country is derived from the VAT ID prefix (primary) or customer.country (fallback).
 * Only EU member states (excl. CZ) with currency === "EUR" are included.
 * Also returns excluded invoices with reasons for diagnostic display.
 */
export async function buildVatRecapStatementData(
  invoices: Invoice[],
  rok: number,
  mesic: number
): Promise<VatRecapStatementData> {
  const pad = (n: number) => String(n).padStart(2, "0")
  const prefix = `${rok}-${pad(mesic)}`

  const inMonth = invoices.filter((inv) => inv.issue_date.startsWith(prefix))

  const excluded: ExcludedInvoice[] = []
  const eligible: Invoice[] = []

  for (const inv of inMonth) {
    if (inv.currency !== "EUR") {
      excluded.push({ invoice: inv, reason: "not_eur_currency" })
      continue
    }
    const vat = inv.customer.dic?.trim() ?? ""
    if (!vat) {
      excluded.push({ invoice: inv, reason: "missing_vat" })
      continue
    }
    const country =
      countryFromVat(vat) ??
      (EU_MEMBER_STATES.has((inv.customer.country ?? "").toUpperCase())
        ? (inv.customer.country ?? "").toUpperCase()
        : null)
    if (!country) {
      excluded.push({ invoice: inv, reason: "not_eu" })
      continue
    }
    eligible.push(inv)
  }

  // Build a rate cache keyed by date to avoid duplicate API calls
  const rateCache = new Map<string, number>()
  async function rate(date: string): Promise<number> {
    if (rateCache.has(date)) return rateCache.get(date) as number
    const r = await getEurCzkRate(date)
    rateCache.set(date, r)
    return r
  }

  interface GroupKey {
    k_stat: string
    c_vat: string
  }
  const groups = new Map<string, { meta: GroupKey; count: number; czk: number }>()

  for (const inv of eligible) {
    const vat = inv.customer.dic?.trim() ?? ""
    const country =
      countryFromVat(vat) ?? (inv.customer.country ?? "").toUpperCase()
    const c_vat = vatNumber(vat)
    const key = `${country}|${c_vat}`

    const eurRate = await rate(inv.issue_date)
    const czk = Math.round(inv.total * eurRate)

    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.czk += czk
    } else {
      groups.set(key, { meta: { k_stat: country, c_vat }, count: 1, czk })
    }
  }

  const rows: VatRecapStatementRow[] = Array.from(groups.values()).map((g) => ({
    k_stat: g.meta.k_stat,
    c_vat: g.meta.c_vat,
    pln_pocet: g.count,
    pln_hodnota: g.czk,
  }))

  return { rok, mesic, rows, invoices: eligible, excluded }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Format date as DD.MM.YYYY */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/**
 * Generate the DPHSHV XML string including the Kontrola checksum block.
 * nazev is the filename without extension (used in the Kontrola tag).
 */
export function generateVatRecapStatementXml(
  data: VatRecapStatementData,
  config: AppConfig,
  nazev: string
): string {
  const tax = config.tax
  const supplier = config.supplier

  // Derive name parts from config: use tax fields if set, else parse supplier.name
  const prijmeni = tax.prijmeni || supplier.name.split(" ").slice(-1)[0] || supplier.name
  const jmeno = tax.jmeno || supplier.name.split(" ").slice(0, -1).join(" ") || ""
  const sest_prijmeni = prijmeni
  const sest_jmeno = jmeno
  const sest_telef = tax.sest_telef || supplier.phone || ""

  const today = fmtDate(new Date())

  // Parse supplier street into ulice + c_pop + c_or
  // "Rezlerova 310"   → ulice="Rezlerova"  c_pop="310"  c_or=""
  // "Rezlerova 310/2" → ulice="Rezlerova"  c_pop="310"  c_or="2"
  // "Novákova 14a"    → ulice="Novákova"   c_pop="14a"  c_or=""
  const streetMatch = supplier.street.match(/^(.+?)\s+(\d+[a-zA-Z]?)(?:\/\d+[a-zA-Z]?)?$/)
  const ulice = streetMatch ? streetMatch[1] : supplier.street
  const c_pop = streetMatch ? streetMatch[2] : ""

  // DIC without CZ prefix for VetaP
  const dic = supplier.dic.replace(/^CZ/i, "")

  const vetaD = `<VetaD k_uladis="DPH" dokument="SHV" rok="${data.rok}" shvies_forma="R" d_poddp="${today}" mesic="${data.mesic}" />`

  const vetaP = `<VetaP c_ufo="${escapeXml(tax.c_ufo)}" c_pracufo="${escapeXml(tax.c_pracufo)}" dic="${escapeXml(dic)}" typ_ds="${escapeXml(tax.typ_ds)}" prijmeni="${escapeXml(prijmeni)}" jmeno="${escapeXml(jmeno)}" naz_obce="${escapeXml(supplier.city)}" ulice="${escapeXml(ulice)}" c_pop="${escapeXml(c_pop)}" psc="${escapeXml(supplier.zip.replace(/\s/g, ""))}" sest_prijmeni="${escapeXml(sest_prijmeni)}" sest_jmeno="${escapeXml(sest_jmeno)}" sest_telef="${escapeXml(sest_telef)}" />`

  const vetaRLines = data.rows.map(
    (row, idx) =>
      `<VetaR por_c_stran="1" c_rad="${idx + 1}" k_stat="${escapeXml(row.k_stat)}" c_vat="${escapeXml(row.c_vat)}" k_pln_eu="3" pln_pocet="${row.pln_pocet}" pln_hodnota="${row.pln_hodnota}" />`
  )

  const dphshv = [
    `<DPHSHV verzePis="02.01">`,
    vetaD,
    vetaP,
    ...vetaRLines,
    `</DPHSHV>`,
  ].join("\n")

  const header = `<?xml version="1.0" encoding="UTF-8"?>`
  const bodyLines = [
    header,
    `<Pisemnost nazevSW="Fakturace" verzeSW="1.0">`,
    dphshv,
  ]
  const bodyWithoutKontrola = bodyLines.join("\n")

  // Compute checksum over the DPHSHV block only (matches EPO convention)
  const kc = createHash("md5").update(dphshv, "utf8").digest("hex")
  const delka = Buffer.byteLength(dphshv, "utf8")

  const kontrola = `<Kontrola><Soubor Delka="${delka}" KC="${kc}" Nazev="${escapeXml(nazev)}" c_ufo="${escapeXml(tax.c_ufo)}" /></Kontrola>`

  return `${bodyWithoutKontrola}\n${kontrola}</Pisemnost>\n`
}

/** Build the canonical filename (without extension) for a given config and datetime */
export function buildVatRecapStatementFilename(config: AppConfig, now: Date): string {
  const dic = config.supplier.dic.replace(/^CZ/i, "")
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `DPHSHV-${dic}-${date}-${time}`
}
