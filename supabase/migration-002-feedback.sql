-- ============================================================
-- 마이그레이션 002: 사용자 의견(피드백) 수집
--
-- 가족·친구가 앱을 쓰다가 발견한 버그나 아쉬운 점을 앱 안에서 바로 남기고,
-- 관리자가 그것을 모아 Claude Code에 그대로 넘길 수 있게 한다.
--
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 기존 데이터에는 영향이 없습니다.
-- ============================================================

create table feedback (
  id uuid primary key default gen_random_uuid(),

  -- bug: 잘못 동작함 / idea: 이런 기능 있으면 좋겠음 / etc: 그 외
  kind text not null default 'bug' check (kind in ('bug', 'idea', 'etc')),
  body text not null,

  -- 어느 화면에서 남겼는지 (map | list) — 재현에 도움이 된다
  screen text,
  -- 브라우저·기기 정보. 아이폰에서만 생기는 문제 등을 가리기 위해 저장한다
  user_agent text,

  -- 처리 상태. 관리자가 바꾼다
  status text not null default 'open' check (status in ('open', 'done', 'wontfix')),

  -- 남긴 사람 (표시용 이름은 스냅샷으로 함께 저장)
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,

  created_at timestamptz default now()
);

create index feedback_status_created_idx on feedback (status, created_at desc);

alter table feedback enable row level security;

-- 남기기: 로그인한 사용자만.
-- 주소가 공개되어 있어 누구나 접근할 수 있으므로, 익명 등록은 막아 스팸을 방지한다.
-- (가족이 로그인 없이도 남기게 하려면 with check (true)로 바꾸면 된다)
create policy "feedback_insert_authenticated" on feedback
  for insert with check (auth.uid() is not null and auth.uid() = created_by);

-- 조회: 본인이 남긴 것 + 관리자는 전부
create policy "feedback_select_own_or_admin" on feedback
  for select using (auth.uid() = created_by or public.is_admin());

-- 상태 변경·삭제: 관리자만
create policy "feedback_update_admin" on feedback
  for update using (public.is_admin()) with check (public.is_admin());

create policy "feedback_delete_admin" on feedback
  for delete using (public.is_admin());
