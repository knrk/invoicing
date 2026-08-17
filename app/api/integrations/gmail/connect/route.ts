import { getGmailAuthUrl } from "@/lib/gmail"
import { NextResponse } from "next/server"

// Přesměruje na Google OAuth consent.
export async function GET() {
  try {
    const url = await getGmailAuthUrl()
    return NextResponse.redirect(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chyba"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
