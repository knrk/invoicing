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
