"use client"

import { createContext, useContext } from "react"
import type { AppRole } from "@/lib/auth"

type RoleContextValue = { role: AppRole; email: string }

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({
  role,
  email,
  children,
}: RoleContextValue & { children: React.ReactNode }) {
  return <RoleContext.Provider value={{ role, email }}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}

export function useIsAdmin(): boolean {
  return useRole().role === "admin"
}
