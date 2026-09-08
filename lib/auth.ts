"use server"

import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

export type AppRole = "admin" | "accountant"

/** The signed-in user, or null. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** The current user's role, or null when unassigned / signed out. */
export async function getUserRole(): Promise<AppRole | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const role = data?.role
  return role === "admin" || role === "accountant" ? role : null
}

/**
 * Guard for mutating server actions. Throws a Czech-friendly error for
 * accountants / unauthenticated callers. RLS is the real gate; this yields a
 * clean message instead of a raw database error.
 */
export async function requireAdmin(): Promise<void> {
  const role = await getUserRole()
  if (role !== "admin") {
    throw new Error("Nemáte oprávnění provést tuto akci (pouze pro administrátora).")
  }
}

/** Sign out and return to the login page. */
export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
