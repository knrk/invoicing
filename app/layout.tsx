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
      <body suppressHydrationWarning>
        <YearFilterProvider availableYears={availableYears} initialYear={initialYear}>
          {/* Layout classes live on this wrapper, NOT on <body>: Radix scroll-lock
              (react-remove-scroll) resets the body's padding/margin while any Select
              is open, which would otherwise make the whole page jump. */}
          <div className="flex h-screen overflow-hidden gap-3 p-3">
            <Sidebar />
            <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
          </div>
        </YearFilterProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
