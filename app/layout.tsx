import type { Metadata } from "next"
import "./globals.css"
import Sidebar from "@/components/ui/Sidebar"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Fakturace",
  description: "Fakturační aplikace",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs">
      <body suppressHydrationWarning className="flex h-screen overflow-hidden gap-3 p-3">
        <Sidebar />
        <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
