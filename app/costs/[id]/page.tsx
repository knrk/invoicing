import CostDetailClient from "@/components/costs/CostDetailClient"
import { getCost } from "@/lib/costs"
import { notFound } from "next/navigation"

interface Props {
  params: Promise<{ id: string }>
}

export default async function CostDetailPage({ params }: Props) {
  const { id } = await params
  const cost = await getCost(id)
  if (!cost) notFound()

  return (
    <main className="mx-auto max-w-7xl px-10 py-8">
      <h1 className="mb-6 text-[22px] font-bold text-text">
        {cost.supplier.name || "Náklad"}
      </h1>
      <CostDetailClient cost={cost} />
    </main>
  )
}
