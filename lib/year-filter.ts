import type { Cost, Invoice } from "@/types"

/** Cookie name for the persisted global year filter. */
export const YEAR_COOKIE = "year-filter"

/** Parse the 4-digit year from a YYYY-MM-DD string. Returns null for empty/invalid input. */
export function yearFromDate(dateStr: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dateStr)
  return match ? Number.parseInt(match[1], 10) : null
}

/** Year of an issued invoice — always from issue_date (always present). */
export function invoiceYear(invoice: Invoice): number | null {
  return yearFromDate(invoice.issue_date)
}

/** Year from raw issue/received date fields — issue_date, fallback received_date. */
export function costYearFromFields(issueDate: string, receivedDate: string): number | null {
  return yearFromDate(issueDate) ?? yearFromDate(receivedDate)
}

/** Year of a received invoice (cost) — issue_date, fallback to received_date. */
export function costYear(cost: Cost): number | null {
  return costYearFromFields(cost.issue_date, cost.received_date)
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
  return availableYears[0] ?? new Date().getFullYear()
}
