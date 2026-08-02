-- 그룹 (즐겨찾기 포함, is_favorite_group 등은 entry 단위 favorite로 처리)
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 맛집 entry
create table entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  memo text,
  catchtable_url text,
  group_id uuid references groups(id) on delete set null,
  is_favorite boolean default false,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 공유 접근: 모두 읽기/쓰기 허용 (팀/가족 단위 공유 앱 전제)
alter table groups enable row level security;
alter table entries enable row level security;

create policy "groups_all_access" on groups
  for all using (true) with check (true);

create policy "entries_all_access" on entries
  for all using (true) with check (true);

-- 기본 그룹 예시
insert into groups (name) values ('전체'), ('즐겨찾기 후보');
