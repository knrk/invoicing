import { getUserRole } from "@/lib/auth"
import { getGmailAuthUrl } from "@/lib/gmail"
import { NextResponse } from "next/server"

// Přesměruje na Google OAuth consent.
export async function GET() {
  if ((await getUserRole()) !== "admin") {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const url = await getGmailAuthUrl()
    return NextResponse.redirect(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chyba"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
