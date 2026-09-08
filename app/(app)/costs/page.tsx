import CostListClient from "@/components/costs/CostListClient"
import { getCosts } from "@/lib/costs"
import { getGmailStatus, listPendingGmail } from "@/lib/gmail"

export default async function CostsPage() {
  const [costs, gmail, pending] = await Promise.all([
    getCosts(),
    getGmailStatus(),
    listPendingGmail(),
  ])
  const gmailReady = gmail.connected && !!gmail.labelId

  return (
    <main className="mx-auto max-w-7xl px-10 py-8">
      <CostListClient costs={costs} gmailReady={gmailReady} pending={pending} />
    </main>
  )
}
