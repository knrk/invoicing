import SupplierListClient from "@/components/suppliers/SupplierListClient"
import { getSuppliers } from "@/lib/suppliers"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()

  return (
    <main className="max-w-7xl mx-auto px-10 py-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-text">Dodavatelé</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {suppliers.length}{" "}
          {suppliers.length === 1
            ? "dodavatel"
            : suppliers.length < 5
              ? "dodavatelé"
              : "dodavatelů"}
        </p>
      </div>
      <SupplierListClient suppliers={suppliers} />
    </main>
  )
}
