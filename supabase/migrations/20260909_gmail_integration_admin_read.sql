-- =====================================================================
-- Tighten `gmail_integration` read access to admin-only.
--
-- The table stores a long-lived Google `refresh_token`. The 20260831_auth
-- rewrite gave every role read access via has_access(), so a read-only
-- `accountant` could `select refresh_token` through the anon key. Only the
-- admin ever connects/uses Gmail, so restrict SELECT to is_admin() too.
-- The write policy is already admin-only and is left unchanged.
-- =====================================================================

drop policy if exists gmail_integration_read on public.gmail_integration;

create policy gmail_integration_read on public.gmail_integration
  for select to authenticated using (public.is_admin());
