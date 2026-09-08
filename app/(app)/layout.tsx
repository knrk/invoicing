import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { RoleProvider } from "@/components/auth/RoleProvider"
import Sidebar from "@/components/ui/Sidebar"
import { YearFilterProvider } from "@/components/year-filter/YearFilterProvider"
import { getAvailableYears } from "@/lib/actions"
import { getSessionUser, getUserRole } from "@/lib/auth"
import { resolveInitialYear, YEAR_COOKIE } from "@/lib/year-filter"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, role] = await Promise.all([getSessionUser(), getUserRole()])
  if (!user) redirect("/login")
  if (!role) redirect("/no-access")

  const [availableYears, cookieStore] = await Promise.all([getAvailableYears(), cookies()])
  const initialYear = resolveInitialYear(availableYears, cookieStore.get(YEAR_COOKIE)?.value)

  return (
    <RoleProvider role={role} email={user.email ?? ""}>
      <YearFilterProvider availableYears={availableYears} initialYear={initialYear}>
        {/* Layout classes live on this wrapper, NOT on <body>: Radix scroll-lock
            (react-remove-scroll) resets the body's padding/margin while any Select
            is open, which would otherwise make the whole page jump. */}
        <div className="flex h-screen overflow-hidden gap-3 p-3">
          <Sidebar />
          <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
        </div>
      </YearFilterProvider>
    </RoleProvider>
  )
}
