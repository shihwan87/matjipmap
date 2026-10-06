# 맛집지도 (matjipmap)

가족·친구가 함께 쓰는 맛집 지도 웹앱. 아이폰은 PWA로 설치, PC는 브라우저로 사용.

- 배포: https://shihwan87.github.io/matjipmap/
- 저장소: https://github.com/shihwan87/matjipmap
- Supabase 프로젝트 ref: `hwrzytnrknpsesmgqhrc`

## 기술 스택

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript, `output: "export"` 정적 빌드
- Supabase (Postgres + Auth + Realtime + Edge Functions). **여러 앱이 같이 쓰는 허브 프로젝트**이고
  이 앱은 그 안의 **`matjib` 스키마**에 산다. 모든 클라이언트(`lib/supabaseClient.ts`, `delete-user` 함수,
  `tools/insta/store.py`)가 `db: { schema: "matjib" }`를 넘기고, Realtime 구독도 `schema: "matjib"`을 지정한다.
  앞으로 SQL은 테이블에 `matjib.`을 붙이거나 `set search_path = matjib, public;`으로 시작한다.
  대시보드 Project Settings → Data API → Exposed schemas에 `matjib`이 있어야 한다.
- Naver Maps JS SDK v3 (`ncpKeyId`, `submodules=geocoder`)
- 순수 CSS (Tailwind 없음)
- GitHub Pages 자동 배포 (`.github/workflows/deploy.yml`)

## 구조

```
app/            layout.tsx, page.tsx, globals.css, manifest.ts
components/     AuthProvider · AuthPanel · AdminPanel · MapView
                EntryForm · EntryList · GroupPanel
                FeedbackPanel · FeedbackAdmin · CandidatePanel
lib/            supabaseClient.ts  (타입 · 업종표 · 이름↔이메일 변환 · nameKey)
supabase/       schema.sql (신규 설치용 전체)
                migration-001~005.sql (기존 설치용 증분)
                functions/search-place, functions/delete-user
tools/insta/    인스타 저장 컬렉션 → 맛집 후보 파이프라인 (Python, PC에서 수동 실행)
                run.py · extract.py · verify.py · store.py · README.md · PATTERN.md
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
| `insta_posts` | 처리한 인스타 포스트. 재실행 시 건너뜀 |
| `candidates` | 인스타에서 뽑은 맛집 후보. `status` pending/registered/rejected, `sources`(출처 포스트들) |

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
- **Next 16은 `output: "export"`에서 `manifest.ts` 같은 메타데이터 라우트에
  `export const dynamic = "force-static"`을 요구한다.** 빼면 빌드가 깨진다.
- **`next dev`가 CLAUDE.md 끝에 `nextjs-agent-rules` 블록을 덧붙인다.** 지워도 다시 생기니 그냥 커밋한다.
- **새 PC에서 `npm`이 안 보이면 터미널을 다시 연다.** Node 설치 전에 연 터미널은 PATH를 모른다.
- **Microsoft Store용 `python` 별칭은 `AppData\Roaming`을 가린다.** 그 아래 있는 Claude 실행 파일·npm 전역
  패키지가 Python에서 "없음"으로 보인다. `tools/insta/run.cmd`가 진짜 python.exe로 다시 실행해 피해 간다.

## 작업 흐름

1. 코드 수정
2. DB 변경이 있으면 Supabase SQL Editor에서 마이그레이션 먼저 실행
3. `npm run build`로 검증
4. commit + push → GitHub Actions가 자동 배포

## 인스타 → 후보 → 등록

`tools/insta/run.py`(PC)가 인스타 저장 컬렉션을 받아 OCR·Claude(`claude -p`)로 가게를 뽑고,
`search-place`로 네이버에서 실재 확인한 뒤 `candidates`에 올린다. 편집자는 앱 상단 **[후보]**에서
[등록](등록 폼이 채워져 열림) / [제외]를 고른다. 자세한 사용법은 `tools/insta/README.md`.

- 상호 비교는 `nameKey()`(TS) = `name_key()`(Python). 소문자 + 글자·숫자 외 제거. 두 쪽을 같이 고친다.
- 제외는 그 건만 닫는다. 같은 상호가 다른 포스트에서 또 나오면 새 후보가 된다.
  대기중 후보는 상호당 하나(부분 유니크 인덱스 `candidates_pending_name_key`).
- 스크립트는 앱 계정(편집자 이상)으로 로그인해 RLS를 그대로 탄다. 서비스 키를 PC에 두지 않는다.
- 인스타 저장 해제 자동화는 일부러 만들지 않았다 (계정 잠김 위험).

## 의견 → 개발 순환

관리자 화면 `받은의견`에서 `파일로 저장 (.md)` → 프로젝트 폴더에 넣고
Claude Code에 "feedback 파일 보고 고쳐줘". 파일에 작업 지시와 기기·화면 맥락이 들어있다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
