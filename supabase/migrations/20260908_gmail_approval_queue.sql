-- Gmail faktury: fronta ke schválení + stav rozhodnutí.

-- 1) Staging tabulka čekajících faktur (mezi checkem a rozhodnutím).
create table if not exists gmail_pending (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  attachment_id text not null,
  parsed jsonb not null,
  email_subject text not null default '',
  email_from text not null default '',
  received_date date,
  attachment_name text,
  has_pdf boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, attachment_id)
);
-- RLS dle auth modelu (viz 20260831_auth.sql): čtení pro přihlášené s rolí,
-- zápis jen admin. NE starý anon-full-access.
alter table gmail_pending enable row level security;
drop policy if exists "anon full access gmail_pending" on gmail_pending;
drop policy if exists gmail_pending_read on gmail_pending;
drop policy if exists gmail_pending_write on gmail_pending;
create policy gmail_pending_read on gmail_pending
  for select to authenticated using (public.has_access());
create policy gmail_pending_write on gmail_pending
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on gmail_pending from anon;
grant select, insert, update, delete on gmail_pending to authenticated;

-- 2) Stav rozhodnutí u zpracovaných zpráv (approved / rejected).
alter table gmail_processed add column if not exists decision text not null default 'approved';
alter table gmail_processed drop constraint if exists gmail_processed_decision_check;
alter table gmail_processed add constraint gmail_processed_decision_check
  check (decision in ('approved','rejected'));
