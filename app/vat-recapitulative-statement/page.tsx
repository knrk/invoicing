import { getConfig, getInvoices } from "@/lib/actions"
import { getCosts } from "@/lib/costs"
import {
  buildReceivedObligationData,
  completedMonths,
} from "@/lib/vat-obligation-overview"
import { buildVatRecapStatementData } from "@/lib/vat-recapitulative-statement"
import VatRecapStatementClient from "@/components/vat-recapitulative-statement/VatRecapStatementClient"

export default async function VatRecapitulativeStatementPage() {
  const [invoices, costs, config] = await Promise.all([
    getInvoices(),
    getCosts(),
    getConfig(),
  ])

  const months = completedMonths(invoices, costs)
  const monthData = await Promise.all(
    months.map(async ({ rok, mesic }) => {
      const received = buildReceivedObligationData(costs, rok, mesic)
      try {
        const data = await buildVatRecapStatementData(invoices, rok, mesic)
        return { rok, mesic, data, received, error: null }
      } catch (err) {
        return {
          rok,
          mesic,
          data: null,
          received,
          error: err instanceof Error ? err.message : "Chyba",
        }
      }
    })
  )

  return (
    <main className="max-w-3xl mx-auto px-10 py-8">
      <h1 className="text-[22px] font-bold text-text mb-2">Souhrnné hlášení</h1>
      <p className="text-sm text-text-secondary mb-8">
        Přehled měsíců s povinností hlášení. Vydané faktury v EUR odběratelům z EU jdou do
        souhrnného hlášení (XML). Přijaté faktury od dodavatelů z EU nebo v režimu přenesené
        daňové povinnosti patří do přiznání k DPH (samovyměření) — zde slouží jen jako kontrola.
      </p>
      <VatRecapStatementClient months={monthData} configMissing={!config} />
    </main>
  )
}
