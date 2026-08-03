-- ============================================================
-- 맛집지도 DB 스키마 (로그인 · 권한 관리 버전)
--
-- 접근 정책 요약
--   비로그인 방문자 : 맛집/그룹 "읽기"만 가능
--   viewer (열람자) : 읽기 + 개인 즐겨찾기
--   editor (편집자) : 위 + 맛집 등록/수정/삭제 (누가 올렸든 수정 가능)
--   admin  (관리자) : 위 + 사용자 역할 관리
--
-- 신규 가입자는 자동으로 viewer가 되며, 관리자가 편집자로 올려줍니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

-- 그룹 (예: 강남, 회사근처, 데이트)
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 목록에 보여줄 순서. 앱의 그룹 관리 화면에서 위/아래로 바꾼다.
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index groups_sort_idx on groups (sort_order);

-- 맛집
create table entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  memo text,
  catchtable_url text,
  group_id uuid references groups(id) on delete set null,
  -- 업종 큰 분류 (한식/일식/카페·디저트 ...). 목록 필터에 쓴다.
  -- 분류를 나중에 바꾸기 쉽도록 CHECK 제약은 걸지 않는다.
  cuisine text,
  -- 네이버 검색이 준 원본 분류 (예: "음식점>한식>냉면"). 세부 정보 보존용.
  category_raw text,
  -- 등록자. 표시용 이름은 등록 시점 스냅샷으로 함께 저장해,
  -- 비로그인 방문자도 프로필 조회 없이 "등록: OO"를 볼 수 있게 한다.
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 사용자 프로필 (auth.users와 1:1). 역할을 여기서 관리한다.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz default now()
);

-- 개인별 즐겨찾기 (사람마다 다른 별표)
create table favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references entries(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, entry_id)
);

-- 사용자 의견 (버그 제보·기능 제안). 관리자가 모아 개발에 넘긴다.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'bug' check (kind in ('bug', 'idea', 'etc')),
  body text not null,
  screen text,          -- 어느 화면에서 남겼는지 (map | list)
  user_agent text,      -- 기기·브라우저 정보 (아이폰 전용 문제 등을 가리기 위해)
  status text not null default 'open' check (status in ('open', 'done', 'wontfix')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now()
);

create index feedback_status_created_idx on feedback (status, created_at desc);
create index entries_cuisine_idx on entries (cuisine);

-- ------------------------------------------------------------
-- 2. 권한 판정 헬퍼
--    security definer로 만들어 RLS 정책 안에서 profiles를 읽어도
--    정책이 자기 자신을 다시 호출하는 무한 재귀가 생기지 않게 한다.
-- ------------------------------------------------------------

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon')
$$;

create or replace function public.can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('admin', 'editor')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() = 'admin'
$$;

-- ------------------------------------------------------------
-- 3. 가입 시 프로필 자동 생성
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'viewer'  -- 신규 가입자는 기본 열람자. 관리자가 승격시킨다.
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. RLS 정책
-- ------------------------------------------------------------

alter table groups enable row level security;
alter table entries enable row level security;
alter table profiles enable row level security;
alter table favorites enable row level security;
alter table feedback enable row level security;

-- 맛집: 누구나 읽기, 편집자 이상만 쓰기
create policy "entries_select_public" on entries
  for select using (true);
create policy "entries_insert_editor" on entries
  for insert with check (public.can_edit());
create policy "entries_update_editor" on entries
  for update using (public.can_edit()) with check (public.can_edit());
create policy "entries_delete_editor" on entries
  for delete using (public.can_edit());

-- 그룹: 누구나 읽기, 편집자 이상만 쓰기
create policy "groups_select_public" on groups
  for select using (true);
create policy "groups_insert_editor" on groups
  for insert with check (public.can_edit());
create policy "groups_update_editor" on groups
  for update using (public.can_edit()) with check (public.can_edit());
create policy "groups_delete_editor" on groups
  for delete using (public.can_edit());

-- 프로필: 로그인한 사람만 조회(이메일 노출 방지), 역할 변경은 관리자만
create policy "profiles_select_authenticated" on profiles
  for select using (auth.uid() is not null);
create policy "profiles_update_admin" on profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- 즐겨찾기: 오직 본인 것만 보고 추가/삭제할 수 있다
create policy "favorites_select_own" on favorites
  for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on favorites
  for delete using (auth.uid() = user_id);

-- 의견: 로그인한 사용자만 남길 수 있고(주소가 공개되어 있어 익명 등록은 막는다),
--       본인 것과 관리자 전체 조회만 허용한다
create policy "feedback_insert_authenticated" on feedback
  for insert with check (auth.uid() is not null and auth.uid() = created_by);
create policy "feedback_select_own_or_admin" on feedback
  for select using (auth.uid() = created_by or public.is_admin());
create policy "feedback_update_admin" on feedback
  for update using (public.is_admin()) with check (public.is_admin());
create policy "feedback_delete_admin" on feedback
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- 5. 실시간 동기화 대상 등록
-- ------------------------------------------------------------

alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table groups;

-- ------------------------------------------------------------
-- 6. 기본 그룹 예시
-- ------------------------------------------------------------

insert into groups (name) values ('강남'), ('회사 근처'), ('가족 외식');

-- ============================================================
-- 설치 후 할 일: 첫 관리자 지정
--
-- 앱에서 본인 이메일로 회원가입을 먼저 한 뒤, 아래를 실행하세요.
--   update profiles set role = 'admin' where email = '본인이메일@example.com';
-- ============================================================
