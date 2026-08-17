import { connectGmail } from "@/lib/gmail"
import { type NextRequest, NextResponse } from "next/server"

// Návrat z Google consent: vymění kód za tokeny a uloží napojení.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const oauthError = url.searchParams.get("error")

  if (oauthError || !code) {
    return NextResponse.redirect(new URL("/settings?gmail=error", url.origin))
  }

  const result = await connectGmail(code)
  const status = result.error ? "error" : "connected"
  return NextResponse.redirect(new URL(`/settings?gmail=${status}`, url.origin))
}
