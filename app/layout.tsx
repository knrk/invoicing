import type { Metadata } from "next"
import { cookies } from "next/headers"
import "./globals.css"
import Sidebar from "@/components/ui/Sidebar"
import { Toaster } from "@/components/ui/sonner"
import { YearFilterProvider } from "@/components/year-filter/YearFilterProvider"
import { getAvailableYears } from "@/lib/actions"
import { resolveInitialYear, YEAR_COOKIE } from "@/lib/year-filter"

export const metadata: Metadata = {
  title: "Fakturace",
  description: "Fakturační aplikace",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [availableYears, cookieStore] = await Promise.all([getAvailableYears(), cookies()])
  const initialYear = resolveInitialYear(availableYears, cookieStore.get(YEAR_COOKIE)?.value)

  return (
    <html lang="cs">
      <body suppressHydrationWarning className="flex h-screen overflow-hidden gap-3 p-3">
        <YearFilterProvider availableYears={availableYears} initialYear={initialYear}>
          <Sidebar />
          <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
        </YearFilterProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
