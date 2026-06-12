import { getConfig, getInvoice, getCustomers } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import InvoiceForm from "@/components/invoice/InvoiceForm"
import { notFound } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const [config, invoice, customers] = await Promise.all([getConfig(), getInvoice(id), getCustomers()])

  if (!config || !invoice) notFound()

  return (
    <>
      <Nav />
      <main>
        <InvoiceForm config={config} existing={invoice} customers={customers} />
      </main>
    </>
  )
}
