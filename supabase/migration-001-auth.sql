-- ============================================================
-- 마이그레이션: 로그인 없는 버전 → 로그인·권한 버전
--
-- 이미 예전 schema.sql로 테이블을 만들어 데이터가 들어있는 경우에만 실행하세요.
-- 처음 설치하는 경우에는 schema.sql만 실행하면 됩니다 (이 파일 불필요).
--
-- 기존 데이터는 유지됩니다.
--   - 기존 created_by(직접 입력한 이름 텍스트) → created_by_name으로 보존
--   - 기존 is_favorite(모두 공유하던 즐겨찾기) → 아래 6번에서 특정 사용자에게 이관 가능
-- ============================================================

-- ------------------------------------------------------------
-- 1. 기존의 "누구나 읽고 쓰기" 정책 제거
-- ------------------------------------------------------------
drop policy if exists "groups_all_access" on groups;
drop policy if exists "entries_all_access" on entries;

-- ------------------------------------------------------------
-- 2. entries 컬럼 정리
--    기존 created_by는 text(직접 입력한 이름)였으므로 표시용으로 이름을 바꾸고,
--    실제 사용자를 가리키는 uuid 컬럼을 새로 만든다.
-- ------------------------------------------------------------
alter table entries rename column created_by to created_by_name;
alter table entries add column created_by uuid references auth.users(id) on delete set null;

-- ------------------------------------------------------------
-- 3. 새 테이블
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz default now()
);

create table favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, entry_id)
);

-- ------------------------------------------------------------
-- 4. 권한 헬퍼 + 가입 트리거
-- ------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon')
$$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin', 'editor')
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin'
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'viewer'
  );
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 5. 새 RLS 정책
-- ------------------------------------------------------------
alter table profiles enable row level security;
alter table favorites enable row level security;

create policy "entries_select_public" on entries
  for select using (true);
create policy "entries_insert_editor" on entries
  for insert with check (public.can_edit());
create policy "entries_update_editor" on entries
  for update using (public.can_edit()) with check (public.can_edit());
create policy "entries_delete_editor" on entries
  for delete using (public.can_edit());

create policy "groups_select_public" on groups
  for select using (true);
create policy "groups_insert_editor" on groups
  for insert with check (public.can_edit());
create policy "groups_update_editor" on groups
  for update using (public.can_edit()) with check (public.can_edit());
create policy "groups_delete_editor" on groups
  for delete using (public.can_edit());

create policy "profiles_select_authenticated" on profiles
  for select using (auth.uid() is not null);
create policy "profiles_update_admin" on profiles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "favorites_select_own" on favorites
  for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on favorites
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6. 기존 공용 즐겨찾기 이관 (선택)
--
--    지금까지의 즐겨찾기는 "모두가 공유하던" 값이라 주인이 없습니다.
--    본인 계정으로 옮기고 싶다면, 회원가입을 마친 뒤 아래 두 줄의 주석을 풀고
--    이메일을 바꿔 실행하세요. 필요 없으면 건너뛰어도 됩니다.
-- ------------------------------------------------------------
-- insert into favorites (user_id, entry_id)
-- select (select id from profiles where email = '본인이메일@example.com'), id
-- from entries where is_favorite = true
-- on conflict do nothing;

-- 이관까지 끝났으면 공용 즐겨찾기 컬럼을 제거한다.
alter table entries drop column if exists is_favorite;

-- ------------------------------------------------------------
-- 7. 실시간 동기화 대상 등록 (이미 등록되어 있으면 에러가 나므로 무시해도 됨)
-- ------------------------------------------------------------
-- alter publication supabase_realtime add table entries;
-- alter publication supabase_realtime add table groups;

-- ============================================================
-- 마지막: 첫 관리자 지정
--   update profiles set role = 'admin' where email = '본인이메일@example.com';
-- ============================================================
