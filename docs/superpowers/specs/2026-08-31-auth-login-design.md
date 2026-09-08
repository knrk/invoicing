# Auth & Login System — Design

Date: 2026-08-31
Branch: `feature/auth-login`

## Goal

Add authentication to the invoicing app so it can be safely deployed on Vercel.
Users are managed manually in Supabase. Two roles: `admin` (full access) and
`accountant` (read-only). The login page follows the app's existing design
language, with a two-panel layout inspired by the provided reference screenshot.

## Decisions (locked)

- **Roles:** `admin` = full access. `accountant` = **read-only**, enforced both in
  the database (RLS) and in the app (UI + server-action guards).
- **Data model:** shared company data. All authenticated users work over the same
  invoices/costs. Auth gates access; role gates writes. No per-user data isolation.
- **Login methods:** email + password, and Google OAuth. No public sign-up, no
  "forgot password" flow.
- **Role storage:** a new `profiles` table keyed to `auth.users`.
- **Google without an assigned role → denied.** Only users the admin has given a
  role can enter. Others are signed out and shown a "no access" page.
- **RLS:** rewrite the current wide-open `anon` policies to `authenticated`.

## Non-goals (YAGNI)

- No in-app user management UI (users/roles are managed in the Supabase dashboard).
- No password reset, email verification, or self sign-up.
- No per-user data partitioning.
- No `SUPABASE_SERVICE_ROLE_KEY` in the app (all management via dashboard).

## Architecture

### 1. Supabase clients & session (Next 16 App Router + `@supabase/ssr`)

- `lib/supabase/server.ts` — already exists; unchanged in shape. After login it
  runs as the authenticated user because it reads the session cookies, so RLS
  applies as that user.
- `lib/supabase/client.ts` — **new** browser client (`createBrowserClient`) used by
  the login form for `signInWithPassword` and `signInWithOAuth`.
- `middleware.ts` (root) + `lib/supabase/middleware.ts` helper — **new**. Refreshes
  the session cookie on every request (the pattern `server.ts` already assumes) and
  acts as the coarse route guard:
  - unauthenticated request to an app route → redirect to `/login`
  - authenticated request to `/login` → redirect to `/`
  - static assets, `/auth/callback`, and the login route are exempt.

### 2. Route structure — route groups

Today `app/layout.tsx` unconditionally renders the `Sidebar` (and
`YearFilterProvider`) around every route. The login page must live outside that
shell, so:

- **`app/(app)/layout.tsx`** (new) — the authenticated app shell: `Sidebar` +
  `YearFilterProvider` + role guard + role provider. Existing routes move here:
  `page.tsx`, `costs/`, `customers/`, `suppliers/`, `settings/`,
  `vat-recapitulative-statement/`, `invoice/`. **URLs are unchanged** (route groups
  do not affect the path).
- **`app/(auth)/login/page.tsx`** (new) + **`app/(auth)/layout.tsx`** (new) — a bare
  layout with no sidebar.
- **`app/layout.tsx`** slims down to `<html lang="cs">`, fonts, `globals.css`, and
  the `Toaster`.
- `app/api/` stays where it is.

### 3. Login page UI

Two-panel layout matching the reference screenshot's *structure*, restyled to the
app's tokens (muted-green `--color-primary`, soft rounded `bg-surface`, pill
buttons, Montserrat/Roboto) — not the reference's pink/purple gradient.

- Left panel: branded hero ("Fakturace" + tagline). Hidden on mobile.
- Right panel: email field, password field (with show/hide toggle and mail/lock
  icons), primary "Přihlásit se" button, an "nebo pokračovat přes" divider, a
  Google button, and an inline error area.
- No "remember me", sign-up link, or forgot-password link.
- All copy in Czech.
- Built from existing shadcn primitives (`input`, `label`, `button`, `card`).

### 4. Google OAuth flow

- Login form calls `supabase.auth.signInWithOAuth({ provider: 'google',
  options: { redirectTo: <origin>/auth/callback } })`.
- **`app/auth/callback/route.ts`** (new) — exchanges `code` for a session
  (`exchangeCodeForSession`), then redirects to `/`.
- Distinct from the existing `app/api/integrations/gmail/callback` (Gmail data
  integration, unrelated).

### 5. Role resolution & the "no access" gate

- **`lib/auth.ts`** (new) — server helpers: `getSessionUser()`,
  `getCurrentUserRole()` (reads `profiles.role` for `auth.uid()`), and
  `requireAdmin()` (throws a friendly error if the caller is not admin).
- **`app/(app)/layout.tsx`** fetches the role once. If the user has no role
  (`NULL`) → redirect to **`app/no-access/page.tsx`** (new), which shows a message
  and a logout button. This is where an unknown Google sign-in lands.
- The resolved role is provided to client components via a small context
  (`components/auth/RoleProvider.tsx`) so the `Sidebar` and pages can adapt.

### 6. Database — `profiles` + RLS rewrite

New migration (and update `supabase-schema.sql`):

```sql
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text check (role in ('admin','accountant')),  -- NULL = no access yet
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- users may read only their own profile row
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

-- auto-create a profile row (role NULL) when an auth user is created
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- role helpers (security definer to avoid RLS recursion)
create function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
```

Every data table (`config`, `invoices`, `customers`, `costs`, `suppliers`,
`gmail_integration`, `gmail_processed`) drops its `anon`-full-access policy and gets:

- `SELECT` → `to authenticated using (true)`
- `INSERT` / `UPDATE` / `DELETE` → `to authenticated using (public.is_admin()) with check (public.is_admin())`

The `costs` Storage bucket gets the same treatment: read for `authenticated`,
write for admins only.

> Note: `config` and `gmail_integration` remain single-row shared tables (not
> per-user), consistent with the shared-data decision. The stored Gmail refresh
> token is now protected by `authenticated`+admin policies instead of `anon`.

### 7. Read-only enforcement for accountant — two layers

1. **RLS (authoritative):** accountant writes are rejected by the database.
2. **App (UX + defense in depth):** each mutating server action in `lib/actions.ts`,
   `lib/costs.ts`, `lib/suppliers.ts`, `lib/gmail.ts`, and config actions calls
   `requireAdmin()` first, returning a friendly Czech error instead of a raw RLS
   failure. Write controls (create/edit/delete buttons, forms) are hidden or
   disabled for accountant in the UI, and the `Sidebar` hides "Nastavení".

### 8. Logout

A `logout` server action (`supabase.auth.signOut()` + redirect to `/login`), wired
to a control in the `Sidebar` that also shows the current user's email and role.

### 9. API route protection

- `app/api/integrations/gmail/connect` and `.../gmail/callback` are admin-only
  (Gmail integration is a Settings feature): they check auth + admin in-route.
- `app/api/ares/[ico]` requires an authenticated user.
- The middleware matcher covers app routes; API routes additionally verify auth in
  their handlers.

### 10. Vercel deployment

Code changes are deployment-ready. Out-of-code configuration (documented as a
checklist for the user, not automated):

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel
  (plus existing `RESEND_*` and `GOOGLE_*` for the Gmail feature).
- In Supabase Auth: set Site URL and redirect URLs to the Vercel domain
  (`https://<domain>/auth/callback`), and enable the Google provider (Client
  ID/Secret + the Supabase callback URL registered in Google Cloud).

## Files

**New**
- `lib/supabase/client.ts`
- `lib/supabase/middleware.ts`, `middleware.ts`
- `lib/auth.ts`
- `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`
- `components/auth/LoginForm.tsx`, `components/auth/RoleProvider.tsx`
- `app/auth/callback/route.ts`
- `app/(app)/layout.tsx`
- `app/no-access/page.tsx`
- SQL migration (profiles, trigger, helpers, RLS rewrite)

**Moved** (into `app/(app)/`, URLs unchanged)
- `page.tsx`, `costs/`, `customers/`, `suppliers/`, `settings/`,
  `vat-recapitulative-statement/`, `invoice/`

**Modified**
- `app/layout.tsx` (slim root)
- `components/Sidebar.tsx` (role-aware nav, user/logout)
- mutating server actions in `lib/actions.ts`, `lib/costs.ts`, `lib/suppliers.ts`,
  `lib/gmail.ts` (+ config actions) — add `requireAdmin()`
- `supabase-schema.sql` (profiles + rewritten policies)

## Testing / verification

- Manual: log in as admin (can edit everything, sees Settings); log in as
  accountant (read-only, no Settings, write attempts blocked with friendly error);
  Google sign-in without a role → no-access page; logout returns to `/login`;
  unauthenticated deep-link redirects to `/login`.
- RLS: verify with the anon/authenticated keys that unauthenticated reads are
  rejected and accountant writes fail at the database.
- Browser preview (dev server on port 3030) to confirm login page renders and the
  redirect flow works.

## Risks / notes

- **Route move churn:** moving existing routes into `(app)/` touches many files but
  is mechanical; imports using `@/` aliases are unaffected. Verify each moved page
  still renders.
- **Next 16 specifics:** consult `node_modules/next/dist/docs/` and the current
  `@supabase/ssr` SSR guide before writing middleware/clients (per AGENTS.md) —
  cookie APIs and middleware conventions may differ from older versions.
- **`security definer` search_path** must be pinned to avoid privilege issues.
- Applying the RLS rewrite before at least one admin profile exists would lock out
  writes; the migration/rollout note must create the first admin before/with the
  policy switch.
