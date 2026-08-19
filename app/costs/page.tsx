import CostListClient from "@/components/costs/CostListClient"
import { getCosts } from "@/lib/costs"
import { getGmailStatus } from "@/lib/gmail"

export default async function CostsPage() {
  const [costs, gmail] = await Promise.all([getCosts(), getGmailStatus()])
  const gmailReady = gmail.connected && !!gmail.labelId

  return (
    <main className="mx-auto max-w-7xl px-10 py-8">
      <div className="mb-8 flex items-center gap-2.5">
        <h1 className="text-2xl font-bold text-text">Přijaté faktury</h1>
        <span className="inline-flex items-center rounded-full border border-border bg-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">
          {costs.length}
        </span>
      </div>
      <CostListClient costs={costs} gmailReady={gmailReady} />
    </main>
  )
}
