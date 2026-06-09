import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
const supabaseKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Intentionally ignored: Server Components cannot call cookies().set().
          // The middleware is responsible for refreshing the session cookie.
        }
      },
    },
  })
}
