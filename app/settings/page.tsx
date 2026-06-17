import SettingsForm from "@/components/invoice/SettingsForm"
import { getConfig } from "@/lib/actions"

export default async function SettingsPage() {
  const config = await getConfig()
  return (
    <main className="max-w-2xl mx-auto px-10 py-8">
      <h1 className="text-[22px] font-bold text-text mb-8">Nastavení</h1>
      <SettingsForm config={config} />
    </main>
  )
}
