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

-- RLS: auth je vynucen politikami založenými na public.profiles a
-- public.is_admin() přidanými na konci tohoto souboru (viz "Auth: profiles,
-- role helpers, RLS rewrite" níže) — nahrazují dřívější anon politiky.
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

-- Migration: add variable_symbol and paid_at columns
alter table invoices add column if not exists variable_symbol text not null default '';
alter table invoices add column if not exists paid_at timestamptz;

-- Migration: add tax column to config (VAT recapitulative statement / souhrnné hlášení)
alter table config add column if not exists tax jsonb not null default '{}';

-- Tabulka odběratelů (saved customers)
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ico text not null default '',
  dic text not null default '',
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  country text not null default 'CZ',
  language text not null check (language in ('cs', 'en')) default 'cs',
  currency text not null check (currency in ('CZK', 'EUR')) default 'CZK',
  payment_method text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on customers (name);

alter table customers enable row level security;
create policy "anon full access customers" on customers for all to anon using (true) with check (true);

-- ==========================================================================
-- Náklady (příchozí faktury) — Fáze 1
-- ==========================================================================
create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  supplier jsonb not null default '{}',
  invoice_number text not null default '',
  variable_symbol text not null default '',
  currency text not null check (currency in ('CZK','EUR')) default 'CZK',
  issue_date date,
  due_date date,
  received_date date,
  total numeric(12,2) not null default 0,
  vat_amount numeric(12,2),
  reverse_charge boolean not null default false,
  is_eu_supplier boolean not null default false,
  note text not null default '',
  paid_at timestamptz,
  file_path text,
  file_name text,
  source text not null check (source in ('upload','gmail')) default 'upload',
  extraction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costs_created_at_idx on costs (created_at desc);
create index if not exists costs_due_date_idx on costs (due_date);

alter table costs enable row level security;
drop policy if exists "anon full access costs" on costs;
create policy "anon full access costs" on costs for all to anon using (true) with check (true);

-- Storage bucket `costs` musí být vytvořen ručně (privátní, "Public" vypnuto).
-- Poté spustit tyto politiky pro anon přístup ke Storage objektům bucketu `costs`:
drop policy if exists "anon read costs files" on storage.objects;
create policy "anon read costs files" on storage.objects
  for select to anon using (bucket_id = 'costs');
drop policy if exists "anon insert costs files" on storage.objects;
create policy "anon insert costs files" on storage.objects
  for insert to anon with check (bucket_id = 'costs');
drop policy if exists "anon delete costs files" on storage.objects;
create policy "anon delete costs files" on storage.objects
  for delete to anon using (bucket_id = 'costs');

-- ==========================================================================
-- Náklady — Fáze 2: napojení Gmailu (import příchozích faktur z labelu)
-- ==========================================================================
-- Jednořádková konfigurace napojení Gmailu (OAuth refresh token + zvolený label).
create table if not exists gmail_integration (
  id integer primary key default 1,
  email text,
  refresh_token text,
  label_id text,
  label_name text,
  -- Kotva pro inkrementální sync přes Gmail History API. Uloží se poslední
  -- zpracovaný historyId; příště se stahují jen změny (labelAdded) od něj.
  history_id text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gmail_integration_single_row check (id = 1)
);
-- Doplnění sloupce pro existující DB (create table if not exists ho nepřidá).
alter table gmail_integration add column if not exists history_id text;
alter table gmail_integration enable row level security;
drop policy if exists "anon full access gmail_integration" on gmail_integration;
create policy "anon full access gmail_integration" on gmail_integration
  for all to anon using (true) with check (true);

-- Deduplikace: které Gmail přílohy už byly zpracovány (aby se neimportovaly znovu,
-- ani po smazání nákladu).
create table if not exists gmail_processed (
  message_id text not null,
  attachment_id text not null,
  cost_id uuid references costs(id) on delete set null,
  processed_at timestamptz not null default now(),
  primary key (message_id, attachment_id)
);
alter table gmail_processed enable row level security;
drop policy if exists "anon full access gmail_processed" on gmail_processed;
create policy "anon full access gmail_processed" on gmail_processed
  for all to anon using (true) with check (true);

-- ==========================================================================
-- Evidence dodavatelů (obdoba odběratelů; přepoužití + reporty)
-- ==========================================================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  ico text not null default '',
  dic text not null default '',
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  country text not null default 'CZ',
  phone text not null default '',
  email text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Migrace pro existující tabulku:
alter table suppliers add column if not exists phone text not null default '';
create index if not exists suppliers_name_idx on suppliers (name);
create index if not exists suppliers_ico_idx on suppliers (ico);
alter table suppliers enable row level security;
drop policy if exists "anon full access suppliers" on suppliers;
create policy "anon full access suppliers" on suppliers
  for all to anon using (true) with check (true);

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

-- Access helper: true when the caller has an assigned role (admin or accountant).
-- role NULL = no access. SECURITY INVOKER, reads only the caller's own profile row.
create or replace function public.has_access()
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','accountant') from public.profiles where id = (select auth.uid())),
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

    -- any signed-in user with an assigned role may read shared company data
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_access());',
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
-- Harden the invoice-sequence RPC: it is SECURITY DEFINER (bypasses RLS), so it
-- must reject non-admin callers explicitly. Pin search_path while here.
create or replace function public.increment_invoice_sequence()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_seq integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin role required';
  end if;

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
  for select to authenticated using (bucket_id = 'costs' and public.has_access());
create policy "admin insert costs files" on storage.objects
  for insert to authenticated with check (bucket_id = 'costs' and public.is_admin());
create policy "admin update costs files" on storage.objects
  for update to authenticated using (bucket_id = 'costs' and public.is_admin())
  with check (bucket_id = 'costs' and public.is_admin());
create policy "admin delete costs files" on storage.objects
  for delete to authenticated using (bucket_id = 'costs' and public.is_admin());
