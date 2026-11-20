/** Záznam o odeslání měsíčních podkladů účetní (tabulka vat_report_sends). */
export interface VatReportSend {
  rok: number
  mesic: number
  sent_at: string
  sent_to: string
}

/** Klíč měsíce pro lookup odeslání. */
export function monthKey(rok: number, mesic: number): string {
  return `${rok}-${mesic}`
}

/** Datum odeslání pro popisek ikony, např. „20. 11. 2026". */
export function formatSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}
