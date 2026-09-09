# 맛집지도 (matjipmap)

가족·친구가 함께 쓰는 맛집 지도 웹앱. 아이폰은 PWA로 설치, PC는 브라우저로 사용.

- 배포: https://shihwan87.github.io/matjipmap/
- 저장소: https://github.com/shihwan87/matjipmap
- Supabase 프로젝트 ref: `hwrzytnrknpsesmgqhrc`

## 기술 스택

- Next.js 14 (App Router) + TypeScript, `output: "export"` 정적 빌드
- Supabase (Postgres + Auth + Realtime + Edge Functions)
- Naver Maps JS SDK v3 (`ncpKeyId`, `submodules=geocoder`)
- 순수 CSS (Tailwind 없음)
- GitHub Pages 자동 배포 (`.github/workflows/deploy.yml`)

## 구조

```
app/            layout.tsx, page.tsx, globals.css, manifest.ts
components/     AuthProvider · AuthPanel · AdminPanel · MapView
                EntryForm · EntryList · GroupPanel
                FeedbackPanel · FeedbackAdmin
lib/            supabaseClient.ts  (타입 · 업종표 · 이름↔이메일 변환)
supabase/       schema.sql (신규 설치용 전체)
                migration-001~004.sql (기존 설치용 증분)
                functions/search-place, functions/delete-user
```

`app/page.tsx`가 오케스트레이터. 데이터 로딩·필터 상태·패널 표시를 모두 여기서 관리하고
자식 컴포넌트에는 props로 내려준다.

## 데이터 모델

| 테이블 | 용도 |
|---|---|
| `entries` | 맛집. `cuisine`(업종 1개), `category_raw`(네이버 원본 분류) |
| `groups` | 그룹. `sort_order`로 사용자 지정 순서 |
| `entry_groups` | 맛집↔그룹 연결. **한 맛집에 여러 그룹** |
| `profiles` | auth.users와 1:1. `role`(admin/editor/viewer) |
| `favorites` | 개인별 즐겨찾기 (user_id, entry_id) |
| `feedback` | 사용자 의견 + 처리 상태 |

## 권한

| 등급 | 권한 |
|---|---|
| 비로그인 | entries·groups 읽기만 |
| viewer | + 개인 즐겨찾기, 의견 남기기 |
| editor | + 맛집·그룹 등록/수정/삭제 (본인 것 아니어도) |
| admin | + 사용자 역할 변경·계정 삭제 |

**권한은 화면이 아니라 RLS로 서버에서 강제된다.** 버튼을 숨기는 것은 방어가 아니다.
정책 안에서 profiles를 조회할 때 무한 재귀가 나지 않도록 `my_role()` / `can_edit()` /
`is_admin()`을 `security definer` 함수로 두었다.

## 로그인

Supabase Auth는 이메일이 필수라, 이름 계정은 이름을 UTF-8 16진수로 바꿔 내부 주소
(`u-<hex>@shihwan87.github.io`)를 만들어 쓴다. 변환은 `lib/supabaseClient.ts`의
`usernameToEmail()`. 로그인 입력란은 `@` 유무로 이름/이메일을 구분한다.

- 가족·친구: 이름 + 비밀번호
- 관리자: 실제 이메일 + 비밀번호 (이름 계정은 비밀번호를 되찾을 수 없어 관리자 불가.
  `profiles` 트리거로 DB에서도 막는다)

**Supabase의 Confirm email은 반드시 OFF여야 한다.** 켜면 이름 계정이 인증을 못 받아 영영 잠긴다.

## 함정 (반복해서 겪은 것들)

- **DB 변경이 필요한 커밋은 SQL을 먼저 실행하고 push한다.** 순서가 바뀌면 배포된 앱이 깨진다.
- **dev 서버를 켠 채 `next build`를 돌리지 않는다.** `.next`가 충돌해 ChunkLoadError가 난다.
  빌드 전에 dev를 내리고 `.next`를 지운다.
- **지도 이벤트 핸들러는 ref로 최신 콜백을 읽는다.** 지도는 한 번만 초기화되므로 첫 렌더의
  props(로그인 전 = 권한 없음)를 붙들어 클릭이 무시되는 버그가 있었다.
- **Edge Function은 Deno 코드**라 `tsconfig.json`의 `exclude`에 들어있다. 빼면 빌드가 깨진다.
- **네이버 검색 API는 NCP의 NAVER API Hub 소속**이다. developers.naver.com이 아니다.
  엔드포인트 `naverapihub.apigw.ntruss.com/search/v1/local`, 헤더 `X-NCP-APIGW-API-KEY-ID/KEY`.
- **GitHub Pages는 하위 경로 배포**라 `NEXT_PUBLIC_BASE_PATH`로 basePath를 준다.
  로컬 dev는 빈 값이므로 루트에서 뜬다.

## 작업 흐름

1. 코드 수정
2. DB 변경이 있으면 Supabase SQL Editor에서 마이그레이션 먼저 실행
3. `npm run build`로 검증
4. commit + push → GitHub Actions가 자동 배포

## 의견 → 개발 순환

관리자 화면 `받은의견`에서 `파일로 저장 (.md)` → 프로젝트 폴더에 넣고
Claude Code에 "feedback 파일 보고 고쳐줘". 파일에 작업 지시와 기기·화면 맥락이 들어있다.
