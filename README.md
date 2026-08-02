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
4. 왼쪽 메뉴 Project Settings → API 클릭
5. `Project URL`, `anon public key` 두 값 복사해두기

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
- 현재는 로그인 없이 모두 읽기/쓰기 가능하도록 설정되어 있음 (가족/친구 단위 소규모 공유 전제)
- 나중에 사람별 로그인이 필요하면 Supabase Auth 추가 가능 (요청 시 도와드릴 수 있음)

### 보안에 대해 알아두실 점

`NEXT_PUBLIC_`으로 시작하는 값은 브라우저에서 동작하기 위해 **배포된 페이지 안에 그대로 들어갑니다.**
이는 Vercel이든 GitHub Pages든 동일하며, Supabase의 anon key는 원래 공개를 전제로 만들어진 키입니다.

다만 현재 DB 정책이 "누구나 읽기/쓰기"이므로, **웹주소를 아는 사람은 누구나 목록을 보고 수정할 수 있습니다.**
가족/친구끼리 주소를 공유하는 용도라면 문제없지만, 외부에 공개하고 싶지 않다면 Supabase Auth로
로그인을 추가하는 편이 좋습니다.

## 폴더 구조

```
app/            페이지, 레이아웃
components/     지도, 폼, 목록 UI
lib/            Supabase 클라이언트
supabase/       DB 스키마
public/         PWA 아이콘, manifest
```

## 현재 기능

- 지도 탭: 네이버지도 위에 맛집 마커 표시, 지도 탭하면 좌표 자동 저장, "내 위치" 버튼
- 목록 탭: 그룹/즐겨찾기 필터 + 검색(이름·주소·메모) + 정렬(최신/이름/즐겨찾기)
- 등록/수정/삭제, 메모, 그룹 지정, 즐겨찾기, Catchtable 링크, 작성자 기록
- 주소 자동화: 지도 탭 시 주소 자동 입력, 폼에서 "주소로 좌표 찾기"
- 카드에서 네이버지도로 바로 열기(길찾기 연결)
- 실시간 동기화: 다른 사람이 추가/수정하면 자동 반영

> 주소 자동 입력/좌표 찾기는 네이버클라우드에서 **Geocoding / Reverse Geocoding API**를 켜야 동작합니다.
> 켜지 않아도 지도·마커·좌표 저장(지도 탭)은 정상 작동하니 선택 사항입니다.
