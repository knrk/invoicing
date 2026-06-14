import { getInvoices, getConfig } from "@/lib/actions"
import InvoiceListClient from "@/components/invoice/InvoiceListClient"

export default async function HomePage() {
  const [invoices, config] = await Promise.all([getInvoices(), getConfig()])

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

      <InvoiceListClient invoices={invoices} config={config} />
    </main>
  )
}
