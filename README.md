# 맛집지도

가족/친구와 함께 쓰는 개인 맛집지도. iOS는 PWA로 설치, Windows는 브라우저로 사용.

## 필요한 것 3가지

1. **Supabase** 계정 (무료) — 공유 DB
2. **Naver Cloud Platform** 계정 (무료) — 지도 API 키
3. **Vercel** 계정 (무료) — 실제 배포

## 1단계. Supabase 설정

1. https://supabase.com 가입 → New Project 생성
2. 왼쪽 메뉴 SQL Editor 클릭
3. `supabase/schema.sql` 파일 내용 전체 복사 → 붙여넣기 → Run
   - 이미 예전 버전으로 테이블을 만들어 두었다면, 대신 `supabase/migration-001-auth.sql`을 실행하세요.
4. 왼쪽 메뉴 **Authentication → Providers → Email**
   - `Confirm email`을 **끄면** 가입 즉시 사용 가능해 가족·친구용으로 편합니다.
   - 켜두면 가입자가 메일함에서 인증 링크를 눌러야 하며, 무료 플랜은 메일 발송 횟수 제한이 있습니다.
5. 왼쪽 메뉴 Project Settings → API 클릭
6. `Project URL`, `anon public key` 두 값 복사해두기

### 첫 관리자 지정 (앱 배포 후 1회)

앱에서 본인 이메일로 **회원가입을 먼저 한 뒤**, SQL Editor에서 아래를 실행하세요.

```sql
update profiles set role = 'admin' where email = '본인이메일@example.com';
```

이후로는 앱 우측 상단 **관리** 버튼에서 다른 사람의 권한을 바꿀 수 있습니다.

## 2단계. 네이버지도 API 키 발급

1. https://www.ncloud.com 가입 (개인/사업자 모두 가능)
2. 콘솔 → AI·NAVER API → Application 등록
3. Maps 선택, 서비스 URL에 나중에 나올 Vercel 주소 등록 (임시로 http://localhost:3000 먼저 등록 가능, 배포 후 추가)
4. 발급된 `Client ID` 복사

## 3단계. 로컬에서 확인 (선택)

```
npm install
cp .env.local.example .env.local
# .env.local 파일 열어서 위에서 복사한 값 3개 채우기
npm run dev
```
브라우저에서 http://localhost:3000 접속.

## 4단계. GitHub Pages로 배포

Maestro와 동일한 방식입니다. 자동 배포 설정(`.github/workflows/deploy.yml`)이 이미 들어 있어,
main 브랜치에 코드를 올릴 때마다 자동으로 빌드·배포됩니다.

1. 이 폴더를 GitHub 저장소 `matjipmap`으로 올리기
   - **주의**: 무료 GitHub Pages는 공개(public) 저장소가 필요합니다.
   - `.gitignore`가 있어 `.env.local`(실제 키)은 올라가지 않습니다.
2. 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   아래 3개를 각각 등록 (1단계·2단계에서 복사해 둔 값)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
3. 저장소 → **Settings → Pages → Source**를 **GitHub Actions**로 변경
4. 저장소 → **Actions** 탭에서 배포가 초록불로 끝나면 완료
   → `https://shihwan87.github.io/matjipmap/`
5. 네이버클라우드 Application 설정에 이 주소를 서비스 URL로 추가

> 저장소 이름이 자동으로 주소의 하위 경로가 됩니다(`NEXT_PUBLIC_BASE_PATH`).
> 저장소 이름을 바꿔도 워크플로가 알아서 맞춥니다.

> Vercel로 배포하고 싶다면: GitHub 저장소를 연결한 뒤 Environment Variables에 위 3개만 넣으면 됩니다
> (`NEXT_PUBLIC_BASE_PATH`는 넣지 않음). 코드 수정은 필요 없습니다.

## 5단계. iOS에 앱처럼 설치

1. 아이폰 사파리로 위에서 만든 주소 접속
2. 공유 버튼 → "홈 화면에 추가"
3. 앱 아이콘처럼 실행됨 (PWA)

## 여러 명이 같이 쓰려면

- Supabase는 프로젝트당 하나의 공유 DB이므로, 위 4개 주소/키를 그대로 다른 사람 기기에도 설정하면 같은 데이터를 함께 봄
- 주소만 공유하면 누구나 **보기**는 가능합니다. 로그인 없이 바로 열립니다.
- 함께 **등록·수정**하려면 각자 회원가입 후, 관리자가 편집자 권한을 부여하면 됩니다.
- 즐겨찾기는 계정별로 따로 저장되므로 서로 간섭하지 않습니다.

### 보안에 대해 알아두실 점

`NEXT_PUBLIC_`으로 시작하는 값은 브라우저에서 동작하기 위해 **배포된 페이지 안에 그대로 들어갑니다.**
이는 Vercel이든 GitHub Pages든 동일하며, Supabase의 anon key는 원래 공개를 전제로 만들어진 키입니다.

실제 보호는 키가 아니라 **DB의 RLS 정책**이 담당합니다. 이 앱은 "누구나 읽기 / 편집자 이상만 쓰기 /
즐겨찾기는 본인 것만"이 서버에서 강제되므로, 키를 알아내도 권한 없이 데이터를 바꿀 수 없습니다.

다만 **맛집 목록 자체는 주소를 아는 누구에게나 공개**됩니다. 이것까지 감추고 싶다면
`entries`의 조회 정책을 `using (auth.uid() is not null)`로 바꾸면 로그인해야 볼 수 있게 됩니다.

## 폴더 구조

```
app/            페이지, 레이아웃
components/     지도, 폼, 목록 UI
lib/            Supabase 클라이언트
supabase/       DB 스키마
public/         PWA 아이콘, manifest
```

## 권한 구조

| 등급 | 볼 수 있는 것 | 할 수 있는 것 |
|---|---|---|
| **비로그인** | 지도·목록 전체 | 보기만 |
| **열람자** (viewer) | 위와 동일 | + 나만의 즐겨찾기 |
| **편집자** (editor) | 위와 동일 | + 맛집 등록·수정·삭제 (누가 올렸든) |
| **관리자** (admin) | 위와 동일 | + 사용자 권한 관리 |

- 새로 가입한 사람은 **자동으로 열람자**가 됩니다. 관리자가 편집자로 올려줘야 등록할 수 있습니다.
- **즐겨찾기(★)는 사람마다 다릅니다.** 내가 별표한 곳만 내 지도에서 빨간 점으로 보입니다.
- 위 규칙은 화면뿐 아니라 **DB 정책(RLS)으로 강제**되므로, 권한 없는 사람은 서버 차원에서 차단됩니다.

## 현재 기능

- 지도 탭: 네이버지도 위에 맛집 마커 표시, 지도 탭하면 좌표 자동 저장, "내 위치" 버튼
- 목록 탭: 그룹/내 즐겨찾기 필터 + 검색(이름·주소·메모) + 정렬(최신/이름/즐겨찾기)
- 등록/수정/삭제, 메모, 그룹 지정, 개인별 즐겨찾기, Catchtable 링크, 등록자 기록
- 로그인(이메일+비밀번호), 역할별 권한, 관리자용 사용자 관리 화면
- 의견 보내기: 사용자가 앱 안에서 버그·건의를 남기고, 관리자가 모아서 개발에 넘김

## 의견을 받아 앱을 고치는 흐름

가족이 쓰다가 불편한 점을 앱 안에서 바로 남기면, 관리자가 그것을 모아 Claude Code에 그대로 넘길 수 있습니다.

1. **사용자**: 우측 상단 `의견` → 종류 고르고 내용 적어 보내기 (로그인 필요)
2. **관리자**: 우측 상단 `받은의견` → 목록 확인
3. **내보내기**: `파일로 저장 (.md)` 클릭 → `matjipmap-feedback-YYYYMMDD.md` 다운로드
4. 그 파일을 프로젝트 폴더(`matjipmap/`)에 넣고, Claude Code에 이렇게 말합니다

   > feedback 파일 보고 고쳐줘

5. 수정이 끝나면 GitHub Desktop에서 **Push** → 자동 재배포
6. 반영된 의견은 `받은의견`에서 **반영함**으로 바꿔 정리

내려받은 파일에는 의견 내용뿐 아니라 **작업 지시와 기기 정보까지** 들어 있어,
따로 설명하지 않아도 Claude Code가 바로 작업할 수 있습니다.

> 이 기능을 쓰려면 `supabase/migration-002-feedback.sql`을 SQL Editor에서 한 번 실행해야 합니다.
- 주소 자동화: 지도 탭 시 주소 자동 입력, 폼에서 "주소로 좌표 찾기"
- 카드에서 네이버지도로 바로 열기(길찾기 연결)
- 실시간 동기화: 다른 사람이 추가/수정하면 자동 반영

> 주소 자동 입력/좌표 찾기는 네이버클라우드에서 **Geocoding / Reverse Geocoding API**를 켜야 동작합니다.
> 켜지 않아도 지도·마커·좌표 저장(지도 탭)은 정상 작동하니 선택 사항입니다.
