-- Matjipmap: move everything from "public" into its own "matjib" schema.
-- Written against C:\Claude\Matjipmap\supabase\schema.sql + migrations 001-005 (read on 2026-10-06).
-- Copy this file into the Matjipmap repo as supabase/migration-006-schema-matjib.sql, then run it
-- in Supabase > SQL Editor on the hub project. Safe to re-run.
--
-- Why functions are recreated and not just moved: SQL/plpgsql function BODIES are plain text, and
-- they say "public.profiles" / "public.my_role()" / "set search_path = public". Moving a function
-- keeps its OID (so the RLS policies and the auth.users trigger that point at it keep working), but
-- the body text would still look in "public". So: move (keeps OID), then "create or replace" with a
-- body that names "matjib".

begin;

create schema if not exists matjib;
grant usage on schema matjib to anon, authenticated, service_role;

-- ---------- 1. Tables (RLS policies, indexes, triggers, constraints travel with them) ----------
alter table if exists public.groups       set schema matjib;
alter table if exists public.entries      set schema matjib;
alter table if exists public.profiles     set schema matjib;
alter table if exists public.entry_groups set schema matjib;
alter table if exists public.favorites    set schema matjib;
alter table if exists public.feedback     set schema matjib;
alter table if exists public.insta_posts  set schema matjib;
alter table if exists public.candidates   set schema matjib;

-- ---------- 2. Functions: move (OID kept), then fix bodies ----------
do $$
declare f text;
begin
  foreach f in array array['my_role()', 'can_edit()', 'is_admin()', 'handle_new_user()', 'enforce_admin_needs_real_email()'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set schema matjib', f);
    end if;
  end loop;
end $$;

create or replace function matjib.my_role()
returns text language sql stable security definer set search_path = matjib, public as $$
  select coalesce((select role from matjib.profiles where id = auth.uid()), 'anon')
$$;

create or replace function matjib.can_edit()
returns boolean language sql stable security definer set search_path = matjib, public as $$
  select matjib.my_role() in ('admin', 'editor')
$$;

create or replace function matjib.is_admin()
returns boolean language sql stable security definer set search_path = matjib, public as $$
  select matjib.my_role() = 'admin'
$$;

create or replace function matjib.handle_new_user()
returns trigger language plpgsql security definer set search_path = matjib, public as $$
begin
  insert into matjib.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'viewer'
  );
  return new;
end
$$;

create or replace function matjib.enforce_admin_needs_real_email()
returns trigger language plpgsql security definer set search_path = matjib, public as $$
begin
  if new.role = 'admin'
     and (new.email is null or new.email like '%@shihwan87.github.io') then
    raise exception '관리자는 실제 이메일로 가입한 계정만 될 수 있습니다.';
  end if;
  return new;
end
$$;

-- ---------- 3. Triggers: recreate explicitly so nothing points at a stale name ----------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function matjib.handle_new_user();

drop trigger if exists profiles_admin_email_check on matjib.profiles;
create trigger profiles_admin_email_check
  before insert or update on matjib.profiles
  for each row execute function matjib.enforce_admin_needs_real_email();

-- ---------- 4. Grants (custom schemas get nothing automatically) ----------
grant all on all tables in schema matjib to anon, authenticated, service_role;
grant all on all sequences in schema matjib to anon, authenticated, service_role;
grant execute on all functions in schema matjib to anon, authenticated, service_role;
alter default privileges in schema matjib grant all on tables to anon, authenticated, service_role;
alter default privileges in schema matjib grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema matjib grant all on functions to anon, authenticated, service_role;

commit;

-- ---------- 5. Verify (run separately, expect 8 tables in matjib and 0 app tables left in public) ----------
-- select table_schema, table_name from information_schema.tables
--   where table_schema in ('public', 'matjib') and table_type = 'BASE TABLE' order by 1, 2;
-- select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where p.proname in ('my_role','can_edit','is_admin','handle_new_user','enforce_admin_needs_real_email');
-- select tgname, tgrelid::regclass from pg_trigger where tgname in ('on_auth_user_created','profiles_admin_email_check');

-- ---------- Rollback (only if something is wrong; reverses section 1 and 2) ----------
-- begin;
-- alter table matjib.groups set schema public; alter table matjib.entries set schema public;
-- alter table matjib.profiles set schema public; alter table matjib.entry_groups set schema public;
-- alter table matjib.favorites set schema public; alter table matjib.feedback set schema public;
-- alter table matjib.insta_posts set schema public; alter table matjib.candidates set schema public;
-- alter function matjib.my_role() set schema public; alter function matjib.can_edit() set schema public;
-- alter function matjib.is_admin() set schema public; alter function matjib.handle_new_user() set schema public;
-- alter function matjib.enforce_admin_needs_real_email() set schema public;
-- commit;
-- Then re-run the original supabase/schema.sql section 2 (functions) from the Matjipmap repo to restore "public." bodies.
