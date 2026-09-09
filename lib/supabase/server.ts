import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { requireEnv } from "@/lib/supabase/env"

export async function createClient() {
  // Touch cookies() first so a static prerender bails to dynamic rendering here,
  // before we read env. Combined with reading env inside the function (never at
  // module top-level), this keeps `next build` from requiring the Supabase env
  // vars at build time: importing the module can't throw, and any page using
  // this client becomes dynamic before the env read runs. The vars are then only
  // required at request time.
  const cookieStore = await cookies()

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Intentionally ignored: Server Components cannot call cookies().set().
          // The middleware is responsible for refreshing the session cookie.
        }
      },
    },
  })
}
