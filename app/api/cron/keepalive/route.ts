import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { requireEnv } from "@/lib/supabase/env"

// Daily Vercel Cron ping so the free-tier Supabase project is never paused for
// inactivity. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  )

  // Any query reaching Postgres counts as activity; RLS may return zero rows
  // for the anon role, which is fine. Only a transport/DB failure is an error.
  const { error } = await supabase.from("config").select("id", { head: true, count: "exact" })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
