import type { Metadata } from "next"
import "./globals.css"

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
      <body suppressHydrationWarning className="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {children}
      </body>
    </html>
  )
}
