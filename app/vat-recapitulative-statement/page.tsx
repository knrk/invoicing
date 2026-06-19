import { getConfig, getInvoices } from "@/lib/actions"
import { buildVatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import VatRecapStatementClient from "@/components/vat-recapitulative-statement/VatRecapStatementClient"

/** How many past months to show (current month + N-1 prior) */
const MONTHS_SHOWN = 13

function monthRange(n: number): { rok: number; mesic: number }[] {
  const result: { rok: number; mesic: number }[] = []
  const now = new Date()
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({ rok: d.getFullYear(), mesic: d.getMonth() + 1 })
  }
  return result
}

export default async function VatRecapitulativeStatementPage() {
  const [invoices, config] = await Promise.all([getInvoices(), getConfig()])

  const months = monthRange(MONTHS_SHOWN)
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
