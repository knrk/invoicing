import { getConfig } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import InvoiceForm from "@/components/invoice/InvoiceForm"
import { redirect } from "next/navigation"

export default async function NewInvoicePage() {
  const config = await getConfig()
  if (!config) redirect("/settings")

  return (
    <>
      <Nav />
      <main>
        <InvoiceForm config={config} />
      </main>
    </>
  )
}
