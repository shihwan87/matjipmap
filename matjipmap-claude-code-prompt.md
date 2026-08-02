# 맛집지도 — Claude Code 빌드 프롬프트

아래 내용을 Claude Code에 그대로 붙여넣어 시작하세요. (`claude` 실행 후 프로젝트 폴더에서 이 전체를 프롬프트로 입력)

---

## 프로젝트 개요

이름: 맛집지도
목적: 가족/친구 등 소규모 그룹이 함께 관리하는 개인화된 맛집 지도 앱
대상 플랫폼: iOS (PWA로 설치), Windows (브라우저로 접속)
동시 사용: 여러 명이 같은 데이터를 실시간으로 함께 보고 편집

## 기술 스택 (고정)

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + Realtime) — 공유 DB, 별도 로그인 없이 팀 단위 공유
- Naver Maps JS SDK v3 (`submodules=geocoder`) — 지도 표시, 마커, 클릭으로 좌표 선택, 주소↔좌표 변환
  (Geocoding / Reverse Geocoding API는 NCP에서 켜져 있을 때만 동작하며, 없어도 지도는 정상 작동)
- 순수 CSS (Tailwind 없이) — 아래 디자인 토큰 그대로 적용
- `app/manifest.ts` (Next Metadata API) — iOS 홈 화면 설치(PWA) 지원
- 정적 배포 (`output: "export"`) — 서버 코드 없이 GitHub Pages / Vercel 어디든 배포 가능.
  하위 경로 배포를 위해 `NEXT_PUBLIC_BASE_PATH` 환경변수로 `basePath`를 제어한다.

## 데이터 모델

**entries**
- id (uuid, pk)
- name (text, 필수)
- address (text, nullable)
- lat, lng (double precision, nullable — 지도 클릭 시 채워짐)
- memo (text, nullable)
- catchtable_url (text, nullable — 링크만 저장, 실검색 연동 없음)
- group_id (uuid, fk → groups.id, nullable)
- created_by (uuid, fk → auth.users.id, nullable)
- created_by_name (text, nullable — 표시용 이름 스냅샷. 비로그인 방문자도 보이도록)
- created_at, updated_at (timestamptz)

**groups**
- id (uuid, pk)
- name (text)
- created_at (timestamptz)

**profiles** (auth.users와 1:1, 역할 보관)
- id (uuid, pk, fk → auth.users.id)
- email, display_name (text)
- role (text, check: admin | editor | viewer, default viewer)
- created_at (timestamptz)

**favorites** (개인별 즐겨찾기)
- user_id (uuid, fk → auth.users.id)
- entry_id (uuid, fk → entries.id)
- pk (user_id, entry_id)

## 권한 모델

이메일+비밀번호 로그인(Supabase Auth). 신규 가입자는 트리거로 profiles가 자동 생성되며 기본 `viewer`.

| 등급 | 권한 |
|---|---|
| 비로그인 | entries·groups 읽기만 |
| viewer | + 개인 즐겨찾기 |
| editor | + entries 등록·수정·삭제 (본인 것 아니어도 가능) |
| admin | + profiles의 role 변경 |

RLS 정책으로 서버에서 강제한다. 정책 안에서 profiles를 조회할 때 무한 재귀가 생기지 않도록
`my_role()` / `can_edit()` / `is_admin()`을 `security definer` 함수로 만들어 사용한다.
- entries·groups: `select using (true)`, 쓰기는 `can_edit()`
- profiles: 조회는 로그인 사용자, 수정은 `is_admin()`
- favorites: `auth.uid() = user_id` 인 행만

## 기능 요구사항

1. **지도 탭**: 네이버지도 위에 entry를 마커로 표시. **내** 즐겨찾기는 빨간 점(accent color) + 흰 테두리, 일반은 어두운 네이비 점. 편집 권한이 있을 때만 지도를 탭하면 좌표가 저장되고(가능하면 역지오코딩으로 주소도 자동 입력) 등록 폼이 열림. 마커를 탭하면 수정 폼. 우하단 "내 위치" 버튼.
2. **목록 탭**: 그룹/내 즐겨찾기 필터 칩 + 검색창(이름·주소·메모) + 정렬(최신순/이름순/즐겨찾기순). 카드형 리스트 (★ 토글, 이름, 주소, 메모, 태그, 등록자, 네이버지도·catchtable 링크). 수정/삭제 버튼은 편집 권한이 있을 때만 노출.
3. **등록/수정 폼**: 이름(필수), 주소(+"좌표 찾기"로 주소→좌표 지오코딩), 그룹 선택, 메모, catchtable 링크. 하단 시트(모달) 형태. 등록자는 로그인 정보에서 자동 기록.
4. **삭제**: 확인 후 즉시 삭제.
5. **실시간 동기화**: Supabase Realtime으로 다른 사용자의 추가/수정/삭제가 자동 반영.
6. **PWA**: `app/manifest.ts`, apple-touch-icon, standalone display. 아이폰 사파리에서 홈 화면 추가 시 앱처럼 실행.
7. **로그인**: 이메일+비밀번호. 상단바에 로그인/로그아웃, 이름, 역할 배지. 비로그인도 열람 가능.
8. **개인별 즐겨찾기**: 카드의 ★를 눌러 토글. 비로그인 상태에서 누르면 로그인 창이 뜬다. 낙관적 업데이트 후 실패 시 롤백.
9. **관리자 화면**: 사용자 목록과 역할 드롭다운. 유일한 관리자가 자기 자신을 강등하지 못하도록 방지.

## 디자인 컨셉 (첨부 이미지 참고: matjipmap-design-concept.png)

컨셉: "메뉴판을 넘기는 느낌" — 절제된 종이질감 배경 + 고추장 레드 포인트 하나.

색상 토큰:
- Ink `#1B2430` — 기본 텍스트, 강조 배경
- Paper `#FAF7F2` — 전체 배경
- Accent `#C1440E` — 즐겨찾기, 등록 버튼, FAB
- Sage `#6F8A63` — 즐겨찾기 태그
- Gold `#B8860B` — 그룹 태그
- Line `#DED6C8` — 구분선, 테두리

타이포그래피:
- 상호명/브랜드: Noto Serif KR (600~700 weight)
- 본문/메모/UI: Noto Sans KR (400~600 weight)

시그니처 요소: 즐겨찾기 항목은 지도·목록 어디서나 동일하게 "빨간 점 + 흰 테두리" 마커로 표시되어 시각적 일관성을 준다.

레이아웃: 상단 탭바(지도/목록), 하단 우측 원형 FAB(+), 목록은 얇은 구분선으로 카드 분리 (그림자·라운드 카드 지양).

## 폴더 구조

```
app/            layout.tsx, page.tsx, globals.css, manifest.ts
components/     AuthProvider.tsx, AuthPanel.tsx, AdminPanel.tsx,
                MapView.tsx, EntryForm.tsx, EntryList.tsx
lib/            supabaseClient.ts
supabase/       schema.sql, migration-001-auth.sql
public/         icons/, .nojekyll
.github/        workflows/deploy.yml
```

## 환경변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
```

## 완료 기준 (Definition of Done)

- [ ] `npm run dev` 로 로컬 실행, 지도/목록 탭 전환 정상
- [ ] 지도 클릭 → 등록 폼 → 저장 → 마커 즉시 표시
- [ ] 목록에서 수정/삭제 정상 동작
- [ ] 그룹/즐겨찾기 필터 + 검색 + 정렬 정상 동작
- [ ] "내 위치" 버튼으로 현재 위치 이동
- [ ] 비로그인 상태에서 지도·목록이 보이고, 등록 버튼(FAB)과 수정/삭제 버튼은 보이지 않음
- [ ] 열람자 계정으로 로그인 시 ★ 토글은 되지만 등록은 막힘 (안내 배너 표시)
- [ ] 편집자 계정으로 등록·수정·삭제 정상 동작
- [ ] 서로 다른 두 계정의 즐겨찾기가 독립적으로 유지됨
- [ ] 관리자 화면에서 역할 변경 시 해당 사용자의 권한이 즉시 바뀜
- [ ] 두 개의 브라우저 탭에서 동시에 열었을 때 한쪽에서 등록하면 다른 쪽에 자동 반영 (Realtime)
- [ ] `npm run build`로 정적 파일(`out/`) 생성 성공
- [ ] GitHub Pages(하위 경로) 또는 Vercel 배포 후 아이폰 사파리 "홈 화면에 추가"로 설치 가능
- [ ] 디자인 토큰(색상/타이포)이 위 명세와 일치

## 참고

기존에 작성된 참고 구현이 `matjipmap.zip`에 있습니다. 동일한 스펙으로 재구현하거나, 이 코드를 기반으로 개선해도 됩니다.
