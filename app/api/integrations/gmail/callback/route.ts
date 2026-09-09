import { getUserRole } from "@/lib/auth"
import { connectGmail } from "@/lib/gmail"
import { type NextRequest, NextResponse } from "next/server"

// Návrat z Google consent: vymění kód za tokeny a uloží napojení.
export async function GET(request: NextRequest) {
  if ((await getUserRole()) !== "admin") {
    return new Response("Forbidden", { status: 403 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const oauthError = url.searchParams.get("error")

  // Surface the real reason: log it server-side (Vercel function logs) and pass a
  // truncated copy to the settings toast, instead of a bare `gmail=error`.
  const fail = (reason: string) => {
    console.error("Gmail connect failed:", reason)
    const target = new URL("/settings", url.origin)
    target.searchParams.set("gmail", "error")
    target.searchParams.set("reason", reason.slice(0, 300))
    return NextResponse.redirect(target)
  }

  if (oauthError || !code) {
    return fail(oauthError ?? "Google nevrátil autorizační kód")
  }

  const result = await connectGmail(code)
  if (result.error) return fail(result.error)
  return NextResponse.redirect(new URL("/settings?gmail=connected", url.origin))
}
