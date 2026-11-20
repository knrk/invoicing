-- Evidence odeslání měsíčních podkladů (souhrnné hlášení) účetní.
-- Jeden řádek na měsíc; opětovné odeslání přepíše sent_at / sent_to.
-- RLS sladěné s auth modelem z 20260831_auth.sql (read přes has_access(),
-- write jen admin). Idempotentní — bezpečné spustit opakovaně.
create table if not exists public.vat_report_sends (
  rok int not null,
  mesic int not null check (mesic between 1 and 12),
  sent_at timestamptz not null default now(),
  sent_to text not null default '',
  primary key (rok, mesic)
);

alter table public.vat_report_sends enable row level security;

drop policy if exists vat_report_sends_read on public.vat_report_sends;
drop policy if exists vat_report_sends_write on public.vat_report_sends;

create policy vat_report_sends_read on public.vat_report_sends
  for select to authenticated using (public.has_access());
create policy vat_report_sends_write on public.vat_report_sends
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.vat_report_sends from anon;
grant select, insert, update, delete on public.vat_report_sends to authenticated;
