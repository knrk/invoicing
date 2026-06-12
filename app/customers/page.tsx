import { getCustomers } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import CustomerListClient from "@/components/invoice/CustomerListClient"

export default async function CustomersPage() {
  const customers = await getCustomers()

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-10 py-8">
        <div className="mb-8">
          <h1 className="text-[22px] font-bold text-text">Odběratelé</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {customers.length}{" "}
            {customers.length === 1 ? "odběratel" : customers.length < 5 ? "odběratelé" : "odběratelů"}
          </p>
        </div>
        <CustomerListClient customers={customers} />
      </main>
    </>
  )
}
