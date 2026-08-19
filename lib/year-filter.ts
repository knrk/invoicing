import type { Cost, Invoice } from "@/types"

/** Cookie name for the persisted global year filter. */
export const YEAR_COOKIE = "year-filter"

/** Parse the 4-digit year from a YYYY-MM-DD string. Returns null for empty/invalid input. */
export function yearFromDate(dateStr: string): number | null {
  if (!dateStr) return null
  const year = Number.parseInt(dateStr.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

/** Year of an issued invoice — always from issue_date (always present). */
export function invoiceYear(invoice: Invoice): number | null {
  return yearFromDate(invoice.issue_date)
}

/** Year of a received invoice (cost) — issue_date, fallback to received_date. */
export function costYear(cost: Cost): number | null {
  return yearFromDate(cost.issue_date) ?? yearFromDate(cost.received_date)
}

/**
 * Resolve the initial selected year:
 *   valid cookie value that is available → current year if available → newest available.
 * `availableYears` must be non-empty and sorted descending (getAvailableYears guarantees both,
 * because it always includes the current year).
 */
export function resolveInitialYear(
  availableYears: number[],
  cookieValue: string | undefined
): number {
  const fromCookie = cookieValue ? Number.parseInt(cookieValue, 10) : Number.NaN
  if (!Number.isNaN(fromCookie) && availableYears.includes(fromCookie)) {
    return fromCookie
  }
  const currentYear = new Date().getFullYear()
  if (availableYears.includes(currentYear)) return currentYear
  return availableYears[0]
}
