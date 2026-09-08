-- Oprava RLS pro gmail_pending: sladit s auth modelem z 20260831_auth.sql
-- (authenticated read přes has_access(), admin-only write přes is_admin()).
-- Původní 20260908 migrace omylem použila starý anon-full-access vzor ze
-- (zastaralého) supabase-schema.sql, takže authenticated insert do fronty
-- selhával na "new row violates row-level security policy". gmail_pending v době
-- auth migrace ještě neexistovala, proto nebyla přepsána spolu s ostatními tabulkami.
-- Idempotentní — bezpečné spustit i na DB, kde už 20260908 proběhla.
alter table public.gmail_pending enable row level security;

drop policy if exists "anon full access gmail_pending" on public.gmail_pending;
drop policy if exists gmail_pending_read on public.gmail_pending;
drop policy if exists gmail_pending_write on public.gmail_pending;

create policy gmail_pending_read on public.gmail_pending
  for select to authenticated using (public.has_access());
create policy gmail_pending_write on public.gmail_pending
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.gmail_pending from anon;
grant select, insert, update, delete on public.gmail_pending to authenticated;
