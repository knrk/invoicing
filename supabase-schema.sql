-- Supabase SQL schema
-- Spusť v Supabase SQL editoru: https://supabase.com/dashboard/project/_/sql

-- Tabulka konfigurace (jeden záznam, id=1)
create table if not exists config (
  id integer primary key default 1,
  supplier jsonb not null default '{}',
  banking jsonb not null default '{}',
  invoice jsonb not null default '{}',
  footer jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Constraint: pouze jeden záznam
alter table config add constraint config_single_row check (id = 1);

-- Tabulka faktur
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  language text not null check (language in ('cs', 'en')),
  currency text not null check (currency in ('CZK', 'EUR')),
  issue_date date not null,
  due_date date not null,
  payment_method text not null default 'Převodem',
  customer jsonb not null default '{}',
  lines jsonb not null default '[]',
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pro řazení
create index if not exists invoices_created_at_idx on invoices (created_at desc);
create index if not exists invoices_invoice_number_idx on invoices (invoice_number);

-- RLS: pro single-user local app stačí anon přístup.
-- TODO: Před veřejným deploymentem nahradit za auth.uid()-based politiky.
alter table config enable row level security;
alter table invoices enable row level security;

create policy "anon full access config" on config for all to anon using (true) with check (true);
create policy "anon full access invoices" on invoices for all to anon using (true) with check (true);

-- Atomic sequence increment — returns the NEW sequence value so caller doesn't
-- need a separate SELECT (which could race with another concurrent increment).
create or replace function increment_invoice_sequence()
returns integer
language plpgsql
security definer
as $$
declare
  new_seq integer;
begin
  update config
  set
    invoice = jsonb_set(
      invoice,
      '{last_sequence}',
      to_jsonb((coalesce(invoice->>'last_sequence', '0')::integer) + 1)
    ),
    updated_at = now()
  where id = 1;

  select (invoice->>'last_sequence')::integer into new_seq from config where id = 1;
  return new_seq;
end;
$$;

-- Allow anon to call the function
grant execute on function increment_invoice_sequence() to anon;

-- Migration: add reverse_charge column (run if table already exists)
alter table invoices add column if not exists reverse_charge boolean not null default false;
