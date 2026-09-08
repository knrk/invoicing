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
alter table gmail_pending enable row level security;
drop policy if exists "anon full access gmail_pending" on gmail_pending;
create policy "anon full access gmail_pending" on gmail_pending
  for all to anon using (true) with check (true);

-- 2) Stav rozhodnutí u zpracovaných zpráv (approved / rejected).
alter table gmail_processed add column if not exists decision text not null default 'approved';
alter table gmail_processed drop constraint if exists gmail_processed_decision_check;
alter table gmail_processed add constraint gmail_processed_decision_check
  check (decision in ('approved','rejected'));
