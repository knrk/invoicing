import { getInvoices, getConfig } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import InvoiceListClient from "@/components/invoice/InvoiceListClient"

export default async function HomePage() {
  const [invoices, config] = await Promise.all([getInvoices(), getConfig()])

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-10 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-bold text-text">Faktury</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {invoices.length}{" "}
              {invoices.length === 1 ? "faktura" : invoices.length < 5 ? "faktury" : "faktur"}
            </p>
          </div>
        </div>

        {!config && (
          <div className="flex items-start gap-2 p-4 text-sm text-warning-text bg-warning-bg border border-warning-border rounded-lg mb-6">
            ⚠️ Nejprve nastavte údaje dodavatele v{" "}
            <a href="/settings" className="underline font-medium">
              Nastavení
            </a>
            .
          </div>
        )}

        <InvoiceListClient invoices={invoices} />
      </main>
    </>
  )
}
