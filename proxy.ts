import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy-session"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common static file extensions
     * API routes are intentionally INCLUDED so they refresh the session too;
     * each route additionally checks auth/role itself (later task).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|eot|css|js|map|txt|xml|json)$).*)",
  ],
}
