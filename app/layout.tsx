import type { Metadata } from "next"
import "./globals.css"
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
      <body suppressHydrationWarning>
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
