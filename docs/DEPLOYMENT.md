# Deployment checklist — Auth on Vercel + Supabase

This app now requires authentication (Supabase Auth). Two roles: `admin` (full access)
and `accountant` (read-only). Users are managed manually in the Supabase dashboard.

Follow the steps in order. Steps 1–3 must be done **before** the app is usable, because
the RLS rewrite removes anonymous access — until an admin profile exists, writes are
blocked for everyone.

## 1. Apply the database migration

Run `supabase/migrations/20260831_auth.sql` against your Supabase project — paste it into
the Supabase **SQL Editor** and run, or use the Supabase CLI / MCP. It:

- creates the `profiles` table (`id`, `email`, `role`) + a trigger that auto-creates a
  profile row (role `NULL`) for every new auth user;
- adds `is_admin()` / `has_access()` helper functions;
- rewrites every data table's RLS from open `anon` access to: **read = any user with an
  assigned role**, **write = admin only**; same for the `costs` Storage bucket;
- hardens the `increment_invoice_sequence()` RPC to admin-only.

Verify afterwards:
```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
Each data table should show a `<table>_read` (SELECT) and `<table>_write` (ALL) policy.

## 2. Create the first admin

1. Supabase dashboard → **Authentication → Users → Add user** → enter the owner's email +
   password. The trigger inserts a `profiles` row with `role = NULL`.
2. **Table editor → `profiles`** → set that row's `role` to `admin`.

```sql
-- confirm
select email, role from public.profiles order by created_at;
```

Users with `role = NULL` can sign in but land on `/no-access` until an admin assigns a role.

## 3. Supabase Auth URL + provider configuration

Authentication → **URL Configuration**:
- **Site URL:** `https://<your-vercel-domain>`
- **Redirect URLs:** add `https://<your-vercel-domain>/auth/callback`
  (and `http://localhost:3030/auth/callback` for local dev)

Authentication → **Providers → Google** (only needed for Google sign-in):
- Enable Google, paste the **Client ID / Client Secret** from a Google Cloud OAuth client.
- In Google Cloud, the OAuth client's **Authorized redirect URI** must be the Supabase
  callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Optional: disable "Enable sign-ups" in Supabase Auth to fully lock manual user management
  (new Google sign-ins still land on `/no-access` until you assign a role).

## 4. Vercel environment variables

Set these in the Vercel project (Project → Settings → Environment Variables):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser + server + proxy) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `RESEND_API_KEY` | Invoice email sending (existing) |
| `RESEND_FROM` | Invoice email sender (existing) |
| `GOOGLE_CLIENT_ID` | Gmail **import** integration (existing, unrelated to login) |
| `GOOGLE_CLIENT_SECRET` | Gmail import integration (existing) |
| `GOOGLE_REDIRECT_URI` | Gmail import integration (existing) — set to the deployed `…/api/integrations/gmail/callback` |

> The `GOOGLE_*` vars power the Gmail cost-import feature, **not** the login. Google login is
> configured entirely in the Supabase dashboard (step 3).

## 5. Deploy & smoke-test

After deploying, verify:
- Logged out → any route redirects to `/login`.
- Admin login (password) → full access, Settings visible, can create/edit/delete.
- Accountant login → read-only, no Settings, write controls hidden.
- Google login with an assigned role → enters the app; without a role → `/no-access`.
- Logout → returns to `/login`.

## Notes

- The Next.js 16 route guard lives in `proxy.ts` (Next 16 renamed `middleware` → `proxy`).
- RLS is the authoritative security layer; the app additionally hides write controls and
  guards mutating server actions with `requireAdmin()` for clean error messages.
- To add a user later: create them in Authentication → Users, then set their `profiles.role`.
