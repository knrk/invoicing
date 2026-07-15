import { getConfig, getInvoices } from "@/lib/actions"
import { buildVatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import type { Invoice } from "@/types"
import VatRecapStatementClient from "@/components/vat-recapitulative-statement/VatRecapStatementClient"

/** Derive unique completed months from invoice issue_dates, newest first. */
function monthsFromInvoices(invoices: Invoice[]): { rok: number; mesic: number }[] {
  const now = new Date()
  const currentYM = now.getFullYear() * 100 + (now.getMonth() + 1)

  const seen = new Set<number>()
  for (const inv of invoices) {
    const [y, m] = inv.issue_date.split("-").map(Number)
    const ym = y * 100 + m
    if (ym < currentYM) seen.add(ym)
  }

  return [...seen]
    .sort((a, b) => b - a)
    .map((ym) => ({ rok: Math.floor(ym / 100), mesic: ym % 100 }))
}

export default async function VatRecapitulativeStatementPage() {
  const [invoices, config] = await Promise.all([getInvoices(), getConfig()])

  const months = monthsFromInvoices(invoices)
  const monthData = await Promise.all(
    months.map(async ({ rok, mesic }) => {
      try {
        const data = await buildVatRecapStatementData(invoices, rok, mesic)
        return { rok, mesic, data, error: null }
      } catch (err) {
        return {
          rok,
          mesic,
          data: null,
          error: err instanceof Error ? err.message : "Chyba",
        }
      }
    })
  )

  return (
    <main className="max-w-3xl mx-auto px-10 py-8">
      <h1 className="text-[22px] font-bold text-text mb-2">Souhrnné hlášení</h1>
      <p className="text-sm text-text-secondary mb-8">
        Přehled měsíců s fakturami v EUR — identifikovaná osoba podává souhrnné hlášení za každý
        měsíc, ve kterém poskytla plnění osobám registrovaným k DPH v jiném státě EU.
      </p>
      <VatRecapStatementClient months={monthData} configMissing={!config} />
    </main>
  )
}
