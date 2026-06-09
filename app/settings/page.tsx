import { getConfig } from "@/lib/actions"
import Nav from "@/components/ui/Nav"
import SettingsForm from "@/components/invoice/SettingsForm"

export default async function SettingsPage() {
  const config = await getConfig()
  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-10 py-8">
        <h1 className="text-[22px] font-bold text-gray-900 mb-8">Nastavení</h1>
        <SettingsForm config={config} />
      </main>
    </>
  )
}
