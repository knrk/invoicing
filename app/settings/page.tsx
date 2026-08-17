import GmailIntegrationSettings from "@/components/costs/GmailIntegrationSettings"
import SettingsForm from "@/components/invoice/SettingsForm"
import { getConfig } from "@/lib/actions"
import { getGmailStatus } from "@/lib/gmail"
import { Suspense } from "react"

export default async function SettingsPage() {
  const [config, gmailStatus] = await Promise.all([getConfig(), getGmailStatus()])
  return (
    <main className="max-w-2xl mx-auto px-10 py-8">
      <h1 className="text-[22px] font-bold text-text mb-8">Nastavení</h1>
      <SettingsForm config={config} />
      <Suspense>
        <GmailIntegrationSettings status={gmailStatus} />
      </Suspense>
    </main>
  )
}
