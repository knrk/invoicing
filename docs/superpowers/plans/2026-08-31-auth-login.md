# Auth & Login System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase email/password + Google authentication with two roles (`admin` full access, `accountant` read-only) so the invoicing app can be deployed publicly on Vercel.

**Architecture:** `@supabase/ssr` session cookies refreshed by a Next.js 16 **`proxy.ts`** (the renamed `middleware`) that guards routes. Roles live in a `profiles` table and are enforced authoritatively by RLS (`authenticated` reads, admin-only writes) plus `requireAdmin()` guards in server actions for friendly errors. The authenticated app shell moves into an `(app)` route group; login lives in an `(auth)` group outside the sidebar.

**Tech Stack:** Next.js 16.2.7 (App Router, Turbopack, Node runtime), React 19.2, `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.108, Tailwind v4 + shadcn/ui, Biome (lint). App language: Czech.

**Verification note (read before starting):** This repo has **no JS unit-test harness** (Biome for lint, no jest/vitest). Do not invent one. Each task is verified by: `npx biome lint <changed files>`, a type/build check, browser-preview flows on port 3030, and SQL checks for RLS. This replaces the usual TDD-unit-test loop and is the honest way to verify auth/SSR/RLS in this codebase.

**Critical framework facts (verified against `node_modules/next/dist/docs`):**
- Next 16 renamed `middleware.ts` → **`proxy.ts`** (root, same level as `app/`). Export a function named `proxy`. Runtime is Node.js and cannot be `edge`. `middleware.ts` still works but is deprecated — use `proxy.ts`.
- `cookies()` / `headers()` are **async-only** in Next 16.
- Route groups `(app)` / `(auth)` do **not** change URLs.

---

## File Structure

**New files**
- `lib/supabase/client.ts` — browser Supabase client (login form, Google OAuth).
- `lib/supabase/proxy-session.ts` — `updateSession(request)` helper: refresh cookie + auth gate.
- `proxy.ts` (root) — exports `proxy`, delegates to `updateSession`.
- `lib/auth.ts` — server helpers: `getSessionUser`, `getUserRole`, `requireAdmin`, `AppRole` type, `logout` action.
- `components/auth/RoleProvider.tsx` — client context exposing `{ role, email }`, hook `useRole()`.
- `app/(app)/layout.tsx` — authenticated shell (sidebar + year filter + role guard + provider).
- `app/(auth)/layout.tsx` — bare shell (no sidebar).
- `app/(auth)/login/page.tsx` — login page (server) rendering the form.
- `components/auth/LoginForm.tsx` — client form (email/password + Google + errors).
- `app/auth/callback/route.ts` — OAuth code exchange.
- `app/no-access/page.tsx` — authenticated-but-no-role screen + logout.
- `supabase/migrations/20260831_auth.sql` — profiles, trigger, helpers, RLS rewrite, grants.

**Moved into `app/(app)/`** (URLs unchanged): `page.tsx`, `costs/`, `customers/`, `suppliers/`, `settings/`, `vat-recapitulative-statement/`, `invoice/`. (`app/api/` and `app/globals.css` stay put.)

**Modified**: `app/layout.tsx` (slim root), `components/ui/Sidebar.tsx` (role-aware nav + user/logout), mutating server actions in `lib/actions.ts` / `lib/costs.ts` / `lib/suppliers.ts` / `lib/gmail.ts` (add `requireAdmin()`), `supabase-schema.sql` (mirror the migration), `app/api/integrations/gmail/connect/route.ts` + `callback/route.ts` + `app/api/ares/[ico]/route.ts` (auth checks).

---

## Task 1: Database — profiles, roles, RLS rewrite, grants

**Files:**
- Create: `supabase/migrations/20260831_auth.sql`
- Modify: `supabase-schema.sql` (append the same statements so the canonical schema stays current)

The app talks to Postgres through PostgREST as the `authenticated` role (anon key + user JWT). After this task, unauthenticated (`anon`) access is removed and writes require `admin`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260831_auth.sql`:

```sql
-- =====================================================================
-- Auth: profiles, role helpers, RLS rewrite (anon -> authenticated)
-- =====================================================================

-- 1) Profiles: one row per auth user. role NULL = no access yet.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text check (role in ('admin','accountant')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Users may read ONLY their own profile row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using ( (select auth.uid()) = id );
-- No insert/update/delete policies: role is managed in the Supabase dashboard
-- (service_role bypasses RLS). App code never writes profiles.

grant select on public.profiles to authenticated;

-- 2) Auto-create a profile (role NULL) whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Role helper. SECURITY INVOKER: it only reads the caller's own profile
-- row, which profiles_select_own already permits, so no RLS recursion and no
-- privilege escalation. Used inside other tables' write policies.
create or replace function public.is_admin()
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = (select auth.uid())),
    false
  );
$$;

-- 4) Rewrite data-table policies: drop anon-full-access, add
--    authenticated-read + admin-only-write. Applied to every data table.
do $$
declare t text;
begin
  foreach t in array array[
    'config','invoices','customers','costs','suppliers',
    'gmail_integration','gmail_processed'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon full access %s" on public.%I;', t, t);
    execute format('drop policy if exists %I on public.%I;', t||'_read',  t);
    execute format('drop policy if exists %I on public.%I;', t||'_write', t);

    -- any signed-in user may read shared company data
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t||'_read', t);
    -- only admins may insert/update/delete
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t||'_write', t);

    -- move table + sequence grants from anon to authenticated
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

-- 5) RPC used by invoice numbering: allow authenticated, drop anon.
revoke execute on function public.increment_invoice_sequence() from anon;
grant execute on function public.increment_invoice_sequence() to authenticated;

-- 6) Storage bucket `costs`: authenticated read, admin-only write.
drop policy if exists "anon read costs files"   on storage.objects;
drop policy if exists "anon insert costs files"  on storage.objects;
drop policy if exists "anon delete costs files"  on storage.objects;
drop policy if exists "auth read costs files"    on storage.objects;
drop policy if exists "admin insert costs files" on storage.objects;
drop policy if exists "admin update costs files" on storage.objects;
drop policy if exists "admin delete costs files" on storage.objects;

create policy "auth read costs files" on storage.objects
  for select to authenticated using (bucket_id = 'costs');
create policy "admin insert costs files" on storage.objects
  for insert to authenticated with check (bucket_id = 'costs' and public.is_admin());
create policy "admin update costs files" on storage.objects
  for update to authenticated using (bucket_id = 'costs' and public.is_admin())
  with check (bucket_id = 'costs' and public.is_admin());
create policy "admin delete costs files" on storage.objects
  for delete to authenticated using (bucket_id = 'costs' and public.is_admin());
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Run it via the Supabase SQL editor (or `execute_sql` through the Supabase MCP if available). Do NOT switch policies before at least one admin exists — Step 4 handles that ordering.

Expected: no errors; `profiles` table exists; `is_admin()` and `handle_new_user()` created.

- [ ] **Step 3: Create the first admin (manual, one-time)**

In the Supabase dashboard → Authentication → Users → Add user, create the owner's email/password user. The trigger inserts a `profiles` row with `role = NULL`. Then in Table editor → `profiles`, set that row's `role = 'admin'`.

Verify:
```sql
select p.email, p.role from public.profiles p order by created_at;
```
Expected: the owner row shows `role = admin`.

- [ ] **Step 4: Verify RLS from both roles**

With the **anon** key (logged out) a read must fail/return nothing; as the admin user, reads and writes must work. Quick check in SQL editor:
```sql
-- Should list the 2 policies (_read, _write) per table:
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('config','invoices','customers','costs','suppliers','gmail_integration','gmail_processed')
order by tablename, policyname;
```
Expected: each table has exactly `<t>_read` (SELECT) and `<t>_write` (ALL).

- [ ] **Step 5: Mirror into `supabase-schema.sql`**

Append the same statements (profiles, trigger, `is_admin()`, the policy rewrite, grants, storage policies) to `supabase-schema.sql`, and replace the outdated `-- TODO: Před veřejným deploymentem nahradit za auth.uid()` note (schema line ~37-38) with a note that auth is now enforced. The canonical schema file must match the live DB.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260831_auth.sql supabase-schema.sql
git commit -m "feat(db): profiles table, role helpers, RLS rewrite to authenticated"
```

---

## Task 2: Browser client + proxy session guard

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/proxy-session.ts`
- Create: `proxy.ts` (project root)

- [ ] **Step 1: Browser client**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  )
}
```

- [ ] **Step 2: Proxy session helper**

Create `lib/supabase/proxy-session.ts`. This refreshes the session cookie and redirects unauthenticated users to `/login`. It must return the same `response` object whose cookies were set (per `@supabase/ssr` contract), otherwise the refreshed session is dropped.

```ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Paths that never require a session.
const PUBLIC_PREFIXES = ["/login", "/auth/callback"]

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return response
}
```

- [ ] **Step 3: Root proxy**

Create `proxy.ts` at the project root (same level as `app/`):

```ts
import { type NextRequest } from "next/server"
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
     * each route additionally checks auth/role itself (Task 8).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
```

- [ ] **Step 4: Lint the new files**

Run: `npx biome lint lib/supabase/client.ts lib/supabase/proxy-session.ts proxy.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/proxy-session.ts proxy.ts
git commit -m "feat(auth): browser client and proxy session guard (Next 16 proxy.ts)"
```

> Note: after this commit the app will redirect everything to `/login`, which does not exist yet — that is expected until Task 5. Do not run the full app between Tasks 2 and 5; lint/type-check only.

---

## Task 3: Server auth helpers + logout action

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Write the helpers**

Create `lib/auth.ts`:

```ts
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
```

- [ ] **Step 2: Lint**

Run: `npx biome lint lib/auth.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): server helpers getSessionUser/getUserRole/requireAdmin/logout"
```

---

## Task 4: Route restructure — `(app)` shell + slim root + RoleProvider

**Files:**
- Create: `components/auth/RoleProvider.tsx`
- Create: `app/(app)/layout.tsx`
- Modify: `app/layout.tsx`
- Move: `app/page.tsx`, `app/costs/`, `app/customers/`, `app/suppliers/`, `app/settings/`, `app/vat-recapitulative-statement/`, `app/invoice/` → under `app/(app)/`

- [ ] **Step 1: Move existing routes into the `(app)` group**

```bash
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/costs "app/(app)/costs"
git mv app/customers "app/(app)/customers"
git mv app/suppliers "app/(app)/suppliers"
git mv app/settings "app/(app)/settings"
git mv app/vat-recapitulative-statement "app/(app)/vat-recapitulative-statement"
git mv app/invoice "app/(app)/invoice"
```

Leave `app/api/`, `app/globals.css`, and `app/layout.tsx` where they are. Confirm:
```bash
ls "app/(app)"    # page.tsx costs customers suppliers settings vat-recapitulative-statement invoice
ls app            # (app) api globals.css layout.tsx
```

- [ ] **Step 2: RoleProvider context**

Create `components/auth/RoleProvider.tsx`:

```tsx
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
```

- [ ] **Step 3: The `(app)` layout (moved shell + role guard)**

Create `app/(app)/layout.tsx`. This is the old root-layout body plus the role gate. Users with no role are sent to `/no-access` (Task 5).

```tsx
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Sidebar from "@/components/ui/Sidebar"
import { RoleProvider } from "@/components/auth/RoleProvider"
import { YearFilterProvider } from "@/components/year-filter/YearFilterProvider"
import { getSessionUser, getUserRole } from "@/lib/auth"
import { getAvailableYears } from "@/lib/actions"
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
            resets body padding while a Select is open. */}
        <div className="flex h-screen overflow-hidden gap-3 p-3">
          <Sidebar />
          <div className="flex-1 overflow-auto rounded-2xl">{children}</div>
        </div>
      </YearFilterProvider>
    </RoleProvider>
  )
}
```

- [ ] **Step 4: Slim the root layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Fakturace",
  description: "Fakturační aplikace",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs">
      <body suppressHydrationWarning>
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Type-check the move**

Run: `npx tsc --noEmit`
Expected: no errors from the moved files (imports use `@/` aliases, unaffected by the move). Fix any relative-import breakage a moved file might have had (there should be none).

- [ ] **Step 6: Lint & commit**

```bash
npx biome lint "app/(app)/layout.tsx" app/layout.tsx components/auth/RoleProvider.tsx
git add -A
git commit -m "feat(auth): move app into (app) group with role guard, slim root layout"
```

---

## Task 5: Login page, Google callback, no-access page

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `components/auth/LoginForm.tsx`
- Create: `app/auth/callback/route.ts`
- Create: `app/no-access/page.tsx`

- [ ] **Step 1: Bare auth layout**

Create `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-page">{children}</div>
}
```

- [ ] **Step 2: Login page (server)**

Create `app/(auth)/login/page.tsx`. Two-panel layout inspired by the reference screenshot, styled with the app's tokens (muted-green primary, soft surfaces, Montserrat heading). Left hero hidden on mobile.

```tsx
import { ReceiptText } from "lucide-react"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-panel overflow-hidden bg-surface shadow-elevated">
        {/* Left hero — hidden on mobile */}
        <div className="hidden md:flex flex-col justify-between p-10 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Fakturace</span>
          </div>
          <div>
            <h1
              className="text-3xl font-extrabold leading-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Fakturační systém
            </h1>
            <p className="mt-3 text-sm text-primary-foreground/80 max-w-xs">
              Vydané i přijaté faktury, souhrnné hlášení a evidence kontaktů na jednom místě.
            </p>
          </div>
          <span className="text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} Fakturace
          </span>
        </div>

        {/* Right — form */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <h2
            className="text-2xl font-bold text-text"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Vítejte zpět
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Přihlaste se pro přístup do aplikace
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Login form (client)**

Create `components/auth/LoginForm.tsx`. Email/password via `signInWithPassword`; Google via `signInWithOAuth`. On success, `window.location.assign("/")` so the proxy re-runs with the new cookie. Errors shown inline in Czech.

```tsx
"use client"

import { useState } from "react"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError("Nesprávný e-mail nebo heslo.")
      setLoading(false)
      return
    }
    window.location.assign("/")
  }

  async function handleGoogleLogin() {
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError("Přihlášení přes Google se nezdařilo.")
      setLoading(false)
    }
    // On success the browser is redirected to Google.
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vy@example.com"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Heslo</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pl-9 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Přihlašuji…" : "Přihlásit se"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex-1 h-px bg-border" />
        nebo pokračovat přes
        <span className="flex-1 h-px bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        <GoogleIcon />
        Google
      </Button>
    </form>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
```

- [ ] **Step 4: OAuth callback route**

Create `app/auth/callback/route.ts`. Exchanges the `?code` for a session cookie, then redirects to `/`. (The `(app)` layout then decides access vs `/no-access`.)

```ts
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/`)
    }
  }
  return NextResponse.redirect(`${origin}/login`)
}
```

- [ ] **Step 5: No-access page**

Create `app/no-access/page.tsx` — reached when a signed-in user has no role (e.g. an unknown Google sign-in). Uses the slim root layout.

```tsx
import { logout } from "@/lib/auth"
import { Button } from "@/components/ui/button"

export default function NoAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-surface rounded-card shadow-card p-10">
        <h1 className="text-xl font-bold text-text" style={{ fontFamily: "var(--font-heading)" }}>
          Nemáte přístup
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Váš účet zatím nemá přiřazenou roli. Požádejte správce o přidělení přístupu.
        </p>
        <form action={logout} className="mt-6">
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Odhlásit se
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Lint the new files**

Run:
```bash
npx biome lint "app/(auth)" "app/auth/callback/route.ts" "app/no-access/page.tsx" components/auth/LoginForm.tsx
```
Expected: no errors.

- [ ] **Step 7: Browser verification (first full run)**

Start the dev server via the Browser pane (`preview_start` name `dev`, port 3030). Then:
1. Visit `/` logged out → redirected to `/login`.
2. Log in with the admin email/password from Task 1 → lands on `/` with the sidebar.
3. Check `read_console_messages` and `preview_logs` for errors.

Expected: login succeeds, invoices list renders, no console errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): login page, Google OAuth callback, no-access page"
```

---

## Task 6: Sidebar — role-aware nav + user info + logout

**Files:**
- Modify: `components/ui/Sidebar.tsx`

- [ ] **Step 1: Hide Settings for accountants and show user/logout**

In `components/ui/Sidebar.tsx`:

1. Add imports near the top:
```tsx
import { LogOut } from "lucide-react"
import { useRole } from "@/components/auth/RoleProvider"
import { logout } from "@/lib/auth"
```

2. Inside `export default function Sidebar()`, after `const path = usePathname()`, read the role:
```tsx
  const { role, email } = useRole()
  const isAdmin = role === "admin"
```

3. Replace the bottom section's `BOTTOM_ITEMS.map(...)` so "Nastavení" only renders for admins. Change the mapped source from `BOTTOM_ITEMS` to a filtered list:
```tsx
        {BOTTOM_ITEMS.filter(() => isAdmin).map(({ href, label, icon: Icon }) => {
```
(Everything else in that `.map` body stays identical.)

4. Add a user block + logout control immediately **before** `<DarkModeToggle collapsed={collapsed} />` in the bottom container:
```tsx
        {!collapsed && (
          <div className="px-3 pt-1 pb-1">
            <p className="text-xs text-muted truncate">{email}</p>
            <p className="text-[11px] text-muted/80">
              {isAdmin ? "Administrátor" : "Účetní"}
            </p>
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            title="Odhlásit se"
            className={cn(
              "flex items-center text-sm w-full text-text-secondary hover:bg-subtle hover:text-text transition-colors",
              collapsed
                ? "justify-center px-0 py-2 rounded-full aspect-square"
                : "gap-3 px-3 py-2 rounded-lg"
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="whitespace-nowrap overflow-hidden">Odhlásit se</span>}
          </button>
        </form>
```

- [ ] **Step 2: Lint**

Run: `npx biome lint components/ui/Sidebar.tsx`
Expected: no errors.

- [ ] **Step 3: Browser verification**

With the dev server running and logged in as admin: the sidebar shows the email, "Administrátor", "Nastavení", and "Odhlásit se". Click "Odhlásit se" → back to `/login`.

Expected: logout works; settings link visible for admin.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Sidebar.tsx
git commit -m "feat(auth): role-aware sidebar with user info and logout"
```

---

## Task 7: Enforce accountant read-only in server actions + UI

**Files:**
- Modify: `lib/actions.ts`, `lib/costs.ts`, `lib/suppliers.ts`, `lib/gmail.ts`
- Modify: relevant page/client components to hide write controls for accountants

- [ ] **Step 1: Enumerate mutating actions**

Run:
```bash
grep -nE "export async function (save|create|update|delete|remove|set|add|import|reimport|backfill|sync|connect|disconnect|mark|send)" lib/actions.ts lib/costs.ts lib/suppliers.ts lib/gmail.ts
```
Expected: a list of every write action. Read actions (`get*`, `list*` that only read) are left alone.

- [ ] **Step 2: Add `requireAdmin()` to each mutating action**

Add the import to each file (top, with the other imports):
```ts
import { requireAdmin } from "@/lib/auth"
```

As the **first statement** inside every mutating action body, add:
```ts
  await requireAdmin()
```

Example — `saveConfig` in `lib/actions.ts` becomes:
```ts
export async function saveConfig(
  config: Omit<AppConfig, "id" | "updated_at">
): Promise<{ error?: string }> {
  await requireAdmin()
  const parsed = AppConfigSchema.omit({ id: true, updated_at: true }).safeParse(config)
  // …unchanged…
}
```

For actions that return `{ error?: string }`, wrap so the friendly message reaches the UI instead of throwing:
```ts
export async function saveConfig(
  config: Omit<AppConfig, "id" | "updated_at">
): Promise<{ error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nemáte oprávnění." }
  }
  // …rest unchanged…
}
```
Use the `try/catch → return { error }` form for actions whose callers display `error`; use the plain `await requireAdmin()` (throw) form for fire-and-forget actions. Apply to **every** write action found in Step 1.

- [ ] **Step 3: Hide write controls in the UI for accountants**

For each page/client component that renders create/edit/delete/save controls, gate them with the role. In client components use the hook:
```tsx
import { useIsAdmin } from "@/components/auth/RoleProvider"
// …
const isAdmin = useIsAdmin()
// wrap the control:
{isAdmin && <Button …>Nová faktura</Button>}
```
In server components under `(app)`, get the role from `getUserRole()` and pass an `isAdmin` prop down. At minimum gate: "Nová faktura" (Sidebar already conditional? no — Sidebar's New-invoice button should also be admin-only: wrap the `/invoice/new` `<Link>` in `components/ui/Sidebar.tsx` with `{isAdmin && (…)}`), invoice row edit/delete, cost create/edit/delete/upload, customer & supplier create/edit/delete, and all of `/settings`.

Run this to find candidate controls:
```bash
grep -rnE "Nová faktura|Uložit|Smazat|Upravit|Přidat|onClick=\{.*delete|onClick=\{.*save" "app/(app)" components
```
Gate each write control with `isAdmin`.

- [ ] **Step 4: Lint + type-check**

Run:
```bash
npx biome lint lib/actions.ts lib/costs.ts lib/suppliers.ts lib/gmail.ts
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Browser verification (accountant)**

Create a second Supabase user, set `profiles.role = 'accountant'`. Log in as that user:
1. No "Nastavení" in the sidebar; visiting `/settings` directly still renders read-only or redirects — verify it does not allow writes.
2. Write controls (new invoice, edit, delete, upload) are hidden.
3. If any write is attempted via a still-visible control, the friendly Czech error appears (not a raw RLS error).
4. Reads (invoice list, costs, reports) all work.

Expected: accountant is effectively read-only in UI and blocked at the DB.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): enforce accountant read-only via requireAdmin and UI gating"
```

---

## Task 8: Protect API routes

**Files:**
- Modify: `app/api/integrations/gmail/connect/route.ts`
- Modify: `app/api/integrations/gmail/callback/route.ts`
- Modify: `app/api/ares/[ico]/route.ts`

- [ ] **Step 1: Admin-gate the Gmail routes**

At the start of each handler in the two Gmail routes, add:
```ts
import { getUserRole } from "@/lib/auth"
// …inside the handler, before any work:
if ((await getUserRole()) !== "admin") {
  return new Response("Forbidden", { status: 403 })
}
```
(For the OAuth `callback` route, if it must complete a Google redirect, gate on authenticated-admin the same way; an unauthenticated hit returns 403.)

- [ ] **Step 2: Auth-gate the ARES lookup**

At the start of the `GET` handler in `app/api/ares/[ico]/route.ts`:
```ts
import { getSessionUser } from "@/lib/auth"
// …
if (!(await getSessionUser())) {
  return new Response("Unauthorized", { status: 401 })
}
```

- [ ] **Step 3: Lint + verify**

Run:
```bash
npx biome lint "app/api/integrations/gmail/connect/route.ts" "app/api/integrations/gmail/callback/route.ts" "app/api/ares/[ico]/route.ts"
```
Then, logged in as admin, confirm ARES lookup still works in the invoice editor (enter an IČO). Logged out, `curl -i http://localhost:3030/api/ares/00000000` → 401.

Expected: routes reject unauthorized callers; admin flows still work.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): protect gmail and ares API routes"
```

---

## Task 9: Full verification + Vercel deployment checklist

**Files:**
- Create: `docs/superpowers/plans/DEPLOYMENT.md` (or append to the spec)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: Biome lint passes and `next build` succeeds with no type errors. Fix anything that fails.

- [ ] **Step 2: End-to-end browser matrix**

With the dev server, verify each flow and capture a screenshot of the login page and the logged-in dashboard:
- Logged out → any route redirects to `/login`.
- Admin login (password) → full access; Settings visible; can create/edit/delete.
- Accountant login → read-only; no Settings; writes blocked.
- Google login as a user **with** a role → enters app; **without** a role → `/no-access` with working logout.
- Logout → `/login`; back button does not expose the app.

- [ ] **Step 3: Write the deployment checklist**

Create `docs/superpowers/plans/DEPLOYMENT.md`:

```markdown
# Deployment checklist (Vercel + Supabase)

## Vercel environment variables
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- RESEND_API_KEY, RESEND_FROM        (existing — invoice email)
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI  (existing — Gmail import, unrelated to login)

## Supabase Auth settings
- Authentication → URL Configuration:
  - Site URL: https://<your-vercel-domain>
  - Redirect URLs: https://<your-vercel-domain>/auth/callback
    (add http://localhost:3030/auth/callback for local dev)
- Authentication → Providers → Google: enable, set Client ID/Secret from a
  Google Cloud OAuth client whose Authorized redirect URI is the Supabase
  callback: https://<project-ref>.supabase.co/auth/v1/callback
- Disable "Enable sign-ups" if you want to fully lock manual user management.

## User management (manual)
- Add users in Authentication → Users.
- The on_auth_user_created trigger creates a profiles row with role NULL.
- In Table editor → profiles, set role = 'admin' or 'accountant'.
- Users with role NULL land on /no-access.

## First-run ordering
- Ensure at least one profiles row has role='admin' BEFORE relying on the app
  for writes (admin-only write policies otherwise block everyone).
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: deployment checklist for auth on Vercel"
```

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR. Push `feature/auth-login` and open a PR for review.

---

## Self-Review

**Spec coverage:**
- Roles admin/accountant, accountant read-only → Tasks 1 (RLS), 6 (nav), 7 (actions+UI). ✓
- Shared company data → Task 1 policies use `using (true)` for reads, no per-user keying. ✓
- Login email/password + Google, no signup/forgot-password → Task 5. ✓
- Role in `profiles` table → Task 1. ✓
- Google without role → denied → Task 4 (`/no-access` redirect) + Task 5 (page). ✓
- RLS rewrite anon → authenticated → Task 1. ✓
- Login layout from screenshot, app styling → Task 5. ✓
- Route group `(app)` / `(auth)` → Task 4/5. ✓
- Proxy session refresh (Next 16 `proxy.ts`) → Task 2. ✓
- Logout → Task 3 + 6. ✓
- API protection → Task 8. ✓
- Vercel deploy config → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. Task 7 Step 3 intentionally uses `grep` discovery because the exact set of write-control components is broad — the gating pattern and the minimum required set are specified explicitly.

**Type consistency:** `AppRole` defined in `lib/auth.ts`, imported by `RoleProvider`. `getUserRole()`/`getSessionUser()`/`requireAdmin()`/`logout()` names used consistently across Tasks 3–8. `createClient()` (browser) vs `createClient()` (server, `@/lib/supabase/server`) are imported from distinct paths per file — browser client only in client components, server client only in server code.
