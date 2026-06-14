import { getConfig, getCustomers } from "@/lib/actions"
import InvoiceForm from "@/components/invoice/InvoiceForm"
import { redirect } from "next/navigation"

export default async function NewInvoicePage() {
  const [config, customers] = await Promise.all([getConfig(), getCustomers()])
  if (!config) redirect("/settings")

  return (
    <main>
      <InvoiceForm config={config} customers={customers} />
    </main>
  )
}
