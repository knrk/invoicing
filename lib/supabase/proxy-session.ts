import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { requireEnv } from "@/lib/supabase/env"

// Paths that never require a session.
const PUBLIC_PREFIXES = ["/login", "/auth/callback"]

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // IMPORTANT: getUser() revalidates the token with the Auth server. Do not put
  // any logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone()
    url.pathname = target
    const redirectResponse = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie)
    }
    return redirectResponse
  }

  if (!user && !isPublic) {
    // API routes must answer with their own 401/403 (JSON), not an HTML redirect
    // to /login — a fetch() client (e.g. IČO autofill) would otherwise receive the
    // login page instead of a proper status. They still got their session refreshed.
    if (pathname.startsWith("/api")) {
      return response
    }
    return redirectTo("/login")
  }

  if (user && pathname === "/login") {
    return redirectTo("/")
  }

  return response
}
