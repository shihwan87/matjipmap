-- ============================================================
-- 마이그레이션 005: 인스타 후보 명단
--
-- PC에서 돌리는 tools/insta 스크립트가 인스타 저장 컬렉션을 읽어
-- 맛집 후보를 뽑아 올리고, 편집자가 앱의 [후보] 화면에서
-- 등록/제외를 결정한다.
--
-- 규칙
--   1. 한 번 처리한 포스트는 다시 보지 않는다      → insta_posts
--   2. 이미 등록된 상호는 후보에 오르지 않는다      → 스크립트·앱이 name_key로 비교
--   3. 제외한 상호라도 다른 포스트에서 다시 나오면
--      새 후보로 다시 올라온다                      → 제외는 그 건(row)만 닫는다.
--      대기중 후보는 상호당 하나만 둔다(부분 유니크 인덱스).
--
-- Supabase SQL Editor에 붙여넣고 Run 하세요.
-- ============================================================

-- 처리한 인스타 포스트. 스크립트가 재실행될 때 여기 있는 포스트는 건너뛴다.
create table if not exists insta_posts (
  shortcode text primary key,          -- 인스타 포스트 고유 코드 (URL 끝부분)
  post_url text,
  username text,
  posted_at timestamptz,
  caption text,
  -- candidate: 후보를 만들었음 / already: 전부 기등록이라 건너뜀
  -- no_venue: 맛집 정보 없음 / failed: 후보는 뽑았으나 검증 실패 (재시도 가능)
  result text not null check (result in ('candidate', 'already', 'no_venue', 'failed')),
  processed_at timestamptz default now()
);

-- 맛집 후보. 편집자가 앱에서 등록/제외를 결정한다.
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 비교용 키: 소문자 + 공백·기호 제거. 앱(nameKey)과 스크립트(name_key)가 같은 규칙을 쓴다.
  name_key text not null,
  address text,
  lat double precision,
  lng double precision,
  category_raw text,       -- 네이버 분류 원본 (예: "음식점>한식>냉면")
  cuisine_hint text,       -- 추출 단계가 추정한 업종 (네이버 분류가 없을 때 보조)
  telephone text,
  -- 네이버 지역검색으로 실제 존재를 확인했는지. false면 앱에서 "미확인" 표시.
  verified boolean not null default false,
  -- 출처 포스트 목록. 같은 상호가 여러 포스트에서 나오면 여기에 쌓인다.
  -- [{ "shortcode", "post_url", "username", "posted_at", "snippet" }]
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'registered', 'rejected')),
  entry_id uuid references entries(id) on delete set null,   -- 등록했을 때 만들어진 맛집
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists candidates_status_idx on candidates (status, created_at desc);
create index if not exists candidates_name_key_idx on candidates (name_key);
-- 대기중 후보는 상호당 하나만. 제외/등록된 것은 여러 개 있어도 된다 (규칙 3).
create unique index if not exists candidates_pending_name_key
  on candidates (name_key) where status = 'pending';

-- ------------------------------------------------------------
-- RLS: 후보는 편집자 이상만 본다 (열람자·비로그인에게는 아직 보여줄 단계가 아님)
-- ------------------------------------------------------------

alter table insta_posts enable row level security;
alter table candidates enable row level security;

create policy "insta_posts_all_editor" on insta_posts
  for all using (public.can_edit()) with check (public.can_edit());

create policy "candidates_all_editor" on candidates
  for all using (public.can_edit()) with check (public.can_edit());
