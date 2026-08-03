-- ============================================================
-- 마이그레이션 003: 업종 분류 + 그룹 다중 선택 + 그룹 순서
--
-- 1) entries에 업종(cuisine)과 원본 분류(category_raw) 추가
--    - cuisine: 목록 필터에 쓰는 큰 분류. 맛집 하나에 하나만 고른다.
--    - category_raw: 네이버 검색이 준 원본 문자열 (예: "음식점>한식>냉면")
-- 2) 그룹을 여러 개 붙일 수 있도록 연결 테이블(entry_groups) 도입
--    기존 entries.group_id는 그 값을 옮긴 뒤 제거한다.
-- 3) groups에 정렬 순서(sort_order) 추가
--
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 기존 데이터는 유지됩니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 업종
-- ------------------------------------------------------------
alter table entries add column if not exists cuisine text;
alter table entries add column if not exists category_raw text;

-- cuisine에는 CHECK 제약을 걸지 않는다.
-- 분류를 추가·변경할 때 DB를 건드리지 않고 앱만 고치면 되도록 하기 위함.
create index if not exists entries_cuisine_idx on entries (cuisine);

-- ------------------------------------------------------------
-- 2. 그룹 다중 선택
-- ------------------------------------------------------------

-- 맛집 ↔ 그룹 연결. 한 맛집이 여러 그룹에 속할 수 있다.
create table if not exists entry_groups (
  entry_id uuid not null references entries(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (entry_id, group_id)
);

create index if not exists entry_groups_group_idx on entry_groups (group_id);

-- 기존에 지정해 둔 그룹을 연결 테이블로 옮긴다.
insert into entry_groups (entry_id, group_id)
select id, group_id from entries where group_id is not null
on conflict do nothing;

-- 옮겼으므로 예전 컬럼은 제거한다.
alter table entries drop column if exists group_id;

alter table entry_groups enable row level security;

-- 읽기는 누구나(비로그인 포함), 쓰기는 편집자 이상.
-- entries·groups와 같은 기준을 적용한다.
drop policy if exists "entry_groups_select_public" on entry_groups;
drop policy if exists "entry_groups_insert_editor" on entry_groups;
drop policy if exists "entry_groups_delete_editor" on entry_groups;

create policy "entry_groups_select_public" on entry_groups
  for select using (true);
create policy "entry_groups_insert_editor" on entry_groups
  for insert with check (public.can_edit());
create policy "entry_groups_delete_editor" on entry_groups
  for delete using (public.can_edit());

-- ------------------------------------------------------------
-- 3. 그룹 순서
-- ------------------------------------------------------------
alter table groups add column if not exists sort_order integer not null default 0;

-- 기존 그룹은 만든 순서대로 1, 2, 3... 을 채워준다.
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from groups
)
update groups g
set sort_order = o.rn
from ordered o
where g.id = o.id and g.sort_order = 0;

create index if not exists groups_sort_idx on groups (sort_order);
