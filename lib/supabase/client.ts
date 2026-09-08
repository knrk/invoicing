import { createBrowserClient } from "@supabase/ssr"

// NOTE: the browser client must reference NEXT_PUBLIC_* env vars with STATIC
// literal keys (process.env.NEXT_PUBLIC_SUPABASE_URL) so Next.js can inline them
// into the client bundle at build time. A dynamic lookup (process.env[name], as
// the shared requireEnv helper does) is NOT inlined for the browser and would be
// undefined at runtime. Server code can use requireEnv; the browser cannot.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
