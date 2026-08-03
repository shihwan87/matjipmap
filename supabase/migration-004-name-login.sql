-- ============================================================
-- 마이그레이션 004: 이름 로그인 도입에 따른 관리자 제한
--
-- 이름만으로 로그인하는 계정은 내부적으로 가짜 이메일
-- (u-xxxx@shihwan87.github.io)로 만들어진다. 이런 계정은 비밀번호를
-- 잃어버려도 메일로 되찾을 수 없으므로 관리자로 두면 위험하다.
--
-- 화면에서도 막지만, 화면만 막는 것은 진짜 방어가 아니므로
-- DB에서도 같은 규칙을 강제한다.
--
-- Supabase SQL Editor에 붙여넣고 Run 하세요.
-- ============================================================

create or replace function public.enforce_admin_needs_real_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin'
     and (new.email is null or new.email like '%@shihwan87.github.io') then
    raise exception '관리자는 실제 이메일로 가입한 계정만 될 수 있습니다.';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_admin_email_check on profiles;

create trigger profiles_admin_email_check
  before insert or update on profiles
  for each row execute function public.enforce_admin_needs_real_email();
