import { getConfig, getInvoice } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import InvoiceForm from "@/components/invoice/InvoiceForm"
import { notFound } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const [config, invoice] = await Promise.all([getConfig(), getInvoice(id)])

  if (!config || !invoice) notFound()

  return (
    <>
      <Nav />
      <main>
        <InvoiceForm config={config} existing={invoice} />
      </main>
    </>
  )
}
