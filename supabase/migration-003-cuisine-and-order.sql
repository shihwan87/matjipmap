-- ============================================================
-- 마이그레이션 003: 업종 분류 + 그룹 순서
--
-- 1) entries에 업종(cuisine)과 원본 분류(category_raw) 추가
--    - cuisine: 목록 필터에 쓰는 큰 분류 (한식/일식/카페·디저트 ...)
--    - category_raw: 네이버 검색이 준 원본 문자열 (예: "음식점>한식>냉면")
--      큰 분류만으로는 아까운 세부 정보를 잃지 않으려고 함께 보관한다.
-- 2) groups에 정렬 순서(sort_order) 추가
--
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 기존 데이터는 유지됩니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 업종
-- ------------------------------------------------------------
alter table entries add column if not exists cuisine text;
alter table entries add column if not exists category_raw text;

-- cuisine에는 CHECK 제약을 걸지 않는다.
-- 나중에 분류를 추가·변경할 때 DB 마이그레이션 없이 앱만 고치면 되도록 하기 위함.

create index if not exists entries_cuisine_idx on entries (cuisine);

-- ------------------------------------------------------------
-- 2. 그룹 순서
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
