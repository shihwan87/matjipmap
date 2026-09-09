# 다른 컴퓨터에서 이어서 작업하기

이 문서만 따라가면 새 컴퓨터에서 개발을 재개할 수 있습니다.
**코드와 DB는 이미 GitHub·Supabase에 올라가 있습니다.** 새로 만들 것은 없고, 가져오기만 하면 됩니다.

---

## 준비물

| | 필요한 것 |
|---|---|
| 계정 | GitHub · Supabase · Naver Cloud (모두 기존 계정 그대로) |
| 프로그램 | Node.js 20 이상, Git, Claude Code |

---

## 1단계. 코드 내려받기

GitHub Desktop → **File → Clone repository** → `shihwan87/matjipmap` 선택

명령어를 쓰신다면:

```bash
git clone https://github.com/shihwan87/matjipmap.git
cd matjipmap
npm install
```

---

## 2단계. 열쇠 파일 만들기

`.env.local`은 **일부러 GitHub에 올리지 않습니다.** 새 컴퓨터에서 직접 만들어야 합니다.

```bash
cp .env.local.example .env.local
```

그 파일을 열어 값 3개를 채웁니다.

| 항목 | 어디서 얻나 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 화면의 `anon public` key |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | NCP → Maps → Application → Client ID |

Supabase 대시보드 바로가기:
https://supabase.com/dashboard/project/hwrzytnrknpsesmgqhrc/settings/api

> 이 값들은 브라우저에 노출되는 공개 키입니다. 실제 보호는 DB의 RLS 정책이 합니다.
> 그래도 `.env.local`은 GitHub에 올리지 마세요 (`.gitignore`에 이미 들어있습니다).

---

## 3단계. 네이버 지도에 새 주소 등록 (로컬 개발용)

NCP → Maps → Application → 웹 서비스 URL에 `http://localhost:3000`이 있는지 확인합니다.
이미 있으면 넘어가세요. 없으면 추가해야 로컬에서 지도가 뜹니다.

---

## 4단계. 실행

```bash
npm run dev
```

http://localhost:3000 접속.

**확인할 것**

- [ ] 지도가 회색이 아니라 정상적으로 보임
- [ ] 우측 상단 로그인 → 기존 계정(이메일)으로 로그인됨
- [ ] 목록 탭에 기존 맛집이 보임

지도가 회색이면 3단계, 목록이 비면 2단계를 다시 보세요.

---

## 5단계. Claude Code로 재개

프로젝트 폴더에서 `claude` 실행. `CLAUDE.md`를 자동으로 읽어 맥락을 파악합니다.

---

## Supabase 쪽은 손댈 것이 없습니다

DB는 클라우드에 있어서 컴퓨터를 바꿔도 그대로입니다. 아래는 **이미 적용된 상태**입니다.

- 마이그레이션 001~004 실행 완료
- 테이블: `entries` `groups` `entry_groups` `profiles` `favorites` `feedback`
- Confirm email **OFF** (이름 로그인에 필수)

---

## 남은 작업

### `delete-user` 함수 배포 (미완)

관리 화면의 계정 삭제 버튼이 아직 동작하지 않습니다. 함수를 배포해야 합니다.

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 이름: **`delete-user`** (정확히)
3. `supabase/functions/delete-user/index.ts` 내용을 통째로 붙여넣기 → **Deploy**

키 등록은 필요 없습니다. Supabase가 자동으로 넣어줍니다.

배포 전에 삭제를 누르면 "삭제에 실패했습니다"가 뜹니다.

### 시험 계정 정리

Supabase → **Authentication → Users**에서 아래가 보이면 지워주세요.

- `u-ed858cec8aa4ed8ab8eab384eca095@shihwan87.github.io` (표시 이름 `테스트계정`)
- `u-74657374303031@matjipmap.com`

---

## 배포하기

GitHub Desktop에서 **Push**하면 끝입니다. GitHub Actions가 자동으로 빌드·배포합니다.
진행 상황은 저장소 **Actions** 탭에서 볼 수 있고, 초록불이 되면 반영된 것입니다.

**DB 구조를 바꾸는 작업은 SQL을 먼저 실행하고 push하세요.** 순서가 바뀌면 배포된 앱이 깨집니다.

---

## 현재 기능

- 지도·목록 탭, 네이버지도 마커, 내 위치
- 이름 또는 이메일 로그인, 3단계 권한(관리자·편집자·열람자)
- 개인별 즐겨찾기 (사람마다 다른 별표)
- 가게 이름 검색으로 등록 (이름·주소·좌표·업종 자동 입력)
- 그룹 다중 선택, 끌어놓기로 순서 변경
- 업종 10종 필터 (그룹 필터와 별개 축)
- 의견 수집 + Claude Code용 마크다운 내보내기
- PWA 설치 (아이폰 사파리 → 공유 → 홈 화면에 추가)
