import InvoiceListClient from "@/components/invoice/InvoiceListClient"
import { getConfig, getInvoicesResult } from "@/lib/actions"

export default async function HomePage() {
  const [{ invoices, error: dbError }, config] = await Promise.all([
    getInvoicesResult(),
    getConfig(),
  ])

  return (
    <main className="max-w-7xl mx-auto px-10 py-8">
      {!config && (
        <div className="flex items-start gap-2 p-4 text-sm text-warning-text bg-warning-bg border border-warning-border rounded-lg mb-6">
          ⚠️ Nejprve nastavte údaje dodavatele v{" "}
          <a href="/settings" className="underline font-medium">
            Nastavení
          </a>
          .
        </div>
      )}

      <InvoiceListClient invoices={invoices} config={config} dbError={dbError} />
    </main>
  )
}
