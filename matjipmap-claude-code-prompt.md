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
- is_favorite (boolean, default false)
- created_by (text, nullable)
- created_at, updated_at (timestamptz)

**groups**
- id (uuid, pk)
- name (text)
- created_at (timestamptz)

RLS: 모두에게 read/write 허용하는 정책 (`using (true) with check (true)`) — 로그인 없는 소규모 공유 전제.

## 기능 요구사항

1. **지도 탭**: 네이버지도 위에 entry를 마커로 표시. 즐겨찾기는 빨간 점(accent color) + 흰 테두리, 일반은 어두운 네이비 점. 지도를 탭하면 좌표가 저장되고(가능하면 역지오코딩으로 주소도 자동 입력) 등록 폼이 열림. 마커를 탭하면 해당 entry 수정 폼이 열림. 우하단 "내 위치" 버튼으로 현재 위치로 이동.
2. **목록 탭**: 그룹/즐겨찾기 필터 칩 + 검색창(이름·주소·메모) + 정렬(최신순/이름순/즐겨찾기순). 카드형 리스트 (이름, 주소, 메모, 태그, 작성자, 네이버지도·catchtable 링크, 수정/삭제 버튼).
3. **등록/수정 폼**: 이름(필수), 주소(+"좌표 찾기"로 주소→좌표 지오코딩), 그룹 선택, 즐겨찾기 여부, 메모, catchtable 링크, 작성자(기기에 기억). 하단 시트(모달) 형태.
4. **삭제**: 확인 후 즉시 삭제.
5. **실시간 동기화**: Supabase Realtime으로 다른 사용자의 추가/수정/삭제가 자동 반영.
6. **PWA**: manifest.json, apple-touch-icon, standalone display. 아이폰 사파리에서 홈 화면 추가 시 앱처럼 실행.
7. **작성자 기록**: 작성자 이름을 브라우저(localStorage)에 기억해 신규 등록 시 `created_by`에 저장, 목록 카드에 "등록: OO" 표시.

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
app/            layout.tsx, page.tsx, globals.css
components/     MapView.tsx, EntryForm.tsx, EntryList.tsx
lib/            supabaseClient.ts
supabase/       schema.sql
public/         manifest.json, icons/
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
- [ ] 작성자 입력 후 재등록 시 이름이 자동으로 채워지고 카드에 표시됨
- [ ] 두 개의 브라우저 탭에서 동시에 열었을 때 한쪽에서 등록하면 다른 쪽에 자동 반영 (Realtime)
- [ ] `npm run build`로 정적 파일(`out/`) 생성 성공
- [ ] GitHub Pages(하위 경로) 또는 Vercel 배포 후 아이폰 사파리 "홈 화면에 추가"로 설치 가능
- [ ] 디자인 토큰(색상/타이포)이 위 명세와 일치

## 참고

기존에 작성된 참고 구현이 `matjipmap.zip`에 있습니다. 동일한 스펙으로 재구현하거나, 이 코드를 기반으로 개선해도 됩니다.
