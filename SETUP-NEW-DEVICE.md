# 다른 컴퓨터에서 이어서 작업하기

이 문서만 따라가면 새 컴퓨터에서 맛집지도 개발을 재개할 수 있습니다.
**코드와 DB는 이미 GitHub·Supabase에 올라가 있습니다.** 새로 만들 것은 없고 가져오기만 하면 됩니다.

전체 30~40분. 대부분 설치를 기다리는 시간입니다.

> 이 문서는 **맛집지도 프로젝트만** 이어서 하기 위한 것입니다.
> Claude Code의 개인 설정(스킬, 출력 규칙 등 `~/.claude/` 폴더)은 포함하지 않습니다.

---

## 준비물

| | 필요한 것 |
|---|---|
| 계정 | GitHub · Supabase · Naver Cloud (**모두 기존 계정 그대로**, 새로 만들지 않음) |
| 프로그램 | Node.js · Git · GitHub Desktop · Claude Code |

---

# 1단계. 프로그램 설치 (15분)

## 1-1. Node.js

앱을 실행하는 엔진입니다.

1. https://nodejs.org 접속
2. **LTS** 라고 적힌 큰 버튼을 눌러 내려받기 (20 이상이면 됩니다)
3. 내려받은 파일을 실행 → **Next만 계속 누르면 됨**
4. 설치가 끝나면 확인합니다

**확인 방법**: 시작 메뉴에서 `PowerShell` 검색 → 실행 → 아래를 붙여넣고 Enter

```
node -v
```

`v20.x.x` 처럼 숫자가 나오면 성공입니다.
`인식할 수 없습니다`가 나오면 **PowerShell 창을 닫았다가 다시 열어보세요.**
그래도 안 되면 컴퓨터를 재시작합니다.

## 1-2. Git

코드 버전을 관리하는 프로그램입니다.

1. https://git-scm.com/download/win 접속 → 자동으로 내려받기 시작
2. 실행 → **Next만 계속** (선택지가 많지만 기본값 그대로 두면 됩니다)
3. 확인: PowerShell에서 `git --version` → 숫자가 나오면 성공

## 1-3. GitHub Desktop

코드를 내려받고 올리는 것을 클릭으로 하게 해줍니다.

1. https://desktop.github.com 접속 → **Download for Windows**
2. 실행하면 설치와 동시에 켜집니다
3. **Sign in to GitHub.com** 클릭 → 브라우저가 열리면 기존 GitHub 계정으로 로그인
4. 이름·이메일을 묻는 화면이 나오면 그대로 **Finish**

## 1-4. Claude Code

PowerShell에서 아래를 붙여넣고 Enter:

```
npm install -g @anthropic-ai/claude-code
```

설치 후 확인: `claude --version`

---

# 2단계. 코드 가져오기 (5분)

## 2-1. 내려받기

1. **GitHub Desktop** 실행
2. 좌측 상단 **File → Clone repository**
3. **GitHub.com** 탭에서 `shihwan87/matjipmap` 선택
   - 목록에 없으면 **URL** 탭을 눌러 `https://github.com/shihwan87/matjipmap` 입력
4. **Local path**에 저장할 위치를 정합니다 (예: `C:\Claude\matjipmap`)
   - **경로에 한글이나 공백이 없는 곳을 권합니다.** 나중에 오류가 줄어듭니다.
5. **Clone** 클릭

## 2-2. 부품 설치

내려받은 코드는 뼈대만 있고, 실행에 필요한 부품(라이브러리)은 따로 받아야 합니다.

GitHub Desktop 상단 메뉴 **Repository → Open in Command Prompt** (또는 PowerShell을 열어 해당 폴더로 이동)

```
npm install
```

2~3분 걸립니다. `added ...packages` 가 나오면 완료입니다.
경고(warning) 문구는 무시해도 됩니다.

---

# 3단계. 열쇠 파일 만들기 (10분)

가장 손이 가는 단계입니다. **여기만 넘기면 나머지는 쉽습니다.**

## 왜 필요한가

Supabase(데이터)와 네이버(지도)에 접속하려면 열쇠 3개가 필요합니다.
이 열쇠는 **일부러 GitHub에 올리지 않습니다.** 그래서 컴퓨터마다 직접 만들어야 합니다.

## 3-1. 빈 파일 만들기

프로젝트 폴더에서 PowerShell을 열고:

```
copy .env.local.example .env.local
```

## 3-2. 열쇠 3개 찾아 넣기

메모장으로 `.env.local` 파일을 엽니다.
(파일 탐색기에서 파일을 우클릭 → 연결 프로그램 → 메모장)

`=` 뒤의 `xxxxx` 부분을 실제 값으로 바꿉니다.

### Supabase 값 2개

바로가기: https://supabase.com/dashboard/project/hwrzytnrknpsesmgqhrc/settings/api

| 화면에 보이는 이름 | 넣을 곳 |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon** `public` 키 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

anon 키는 매우 깁니다(`eyJ...`로 시작). **전체를 복사**하세요.

### 네이버 값 1개

1. https://www.ncloud.com 로그인 → 우측 상단 **콘솔**
2. 좌측 메뉴 **Services → Application Services → Maps → Application**
3. 등록해 둔 앱 이름 클릭 → **Client ID** 복사
4. `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` 에 붙여넣기

### 완성된 모습

```
NEXT_PUBLIC_SUPABASE_URL=https://hwrzytnrknpsesmgqhrc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=8b7ian8bnh
```

**주의사항**
- `=` 앞뒤에 **공백을 넣지 마세요**
- 값을 따옴표로 감싸지 마세요
- 저장할 때 파일 이름이 `.env.local.txt` 로 바뀌지 않았는지 확인하세요
  (메모장 저장 시 파일 형식을 **모든 파일**로 두면 됩니다)

> 이 값들은 브라우저에 노출되는 공개 키입니다. 실제 보호는 DB의 RLS 정책이 담당합니다.
> 그래도 `.env.local` 은 GitHub에 올리지 마세요. `.gitignore`에 이미 등록돼 있어 자동으로 제외됩니다.

---

# 4단계. 네이버 지도 주소 등록 확인 (2분)

네이버는 **등록된 주소에서 온 요청만** 지도를 내어줍니다.
새 컴퓨터에서도 주소는 같으므로 보통 이미 등록돼 있습니다. 확인만 하세요.

1. NCP 콘솔 → **Maps → Application** → 앱 클릭
2. **웹 서비스 URL** 목록에 아래 두 개가 있는지 확인

```
http://localhost:3000
https://shihwan87.github.io
```

3. 없으면 추가하고 저장

이걸 빠뜨리면 **지도만 회색으로** 뜹니다. 나머지는 정상 동작하므로 원인을 찾기 어렵습니다.

---

# 5단계. 실행하고 점검 (5분)

## 5-1. 실행

프로젝트 폴더에서:

```
npm run dev
```

`Ready in ...` 이 나오면 브라우저에서 **http://localhost:3000** 접속.

끄려면 그 PowerShell 창에서 **Ctrl + C**.

## 5-2. 3가지 점검

- [ ] **지도 탭** - 지도가 회색이 아니라 정상으로 보임
- [ ] **로그인** - 우측 상단 로그인 → 기존 이메일 계정으로 들어가짐
- [ ] **목록 탭** - 기존에 등록한 맛집이 보임

## 5-3. 안 될 때

| 증상 | 원인 | 해결 |
|---|---|---|
| 지도만 회색 | 네이버 주소 미등록 | 4단계 |
| 목록이 비어있음 | Supabase 열쇠 오타 | 3단계, 특히 anon 키 전체 복사 확인 |
| 로그인 실패 | 열쇠는 맞지만 계정 오류 | 이메일·비밀번호 재확인 |
| `npm이 인식되지 않습니다` | Node.js 설치 후 창 미갱신 | PowerShell 닫고 다시 열기 |
| 페이지가 아예 안 뜸 | dev 서버가 꺼짐 | `npm run dev` 다시 실행 |

## 5-4. Claude Code로 재개

프로젝트 폴더에서:

```
claude
```

`CLAUDE.md`를 자동으로 읽어 프로젝트 구조와 주의사항을 파악합니다.
처음 실행하면 로그인을 요구합니다.

---

# Supabase는 할 일이 없습니다

DB는 클라우드에 있어서 컴퓨터를 바꿔도 그대로입니다. 아래는 **이미 적용된 상태**입니다.

- 마이그레이션 001~004 실행 완료
- 테이블: `entries` `groups` `entry_groups` `profiles` `favorites` `feedback`
- Confirm email **OFF** (이름 로그인에 필수)
- `search-place` 함수 배포 완료

---

# 남은 작업

## `delete-user` 함수 배포 (미완)

관리 화면의 **계정 삭제** 버튼이 아직 동작하지 않습니다.

1. Supabase → 좌측 **Edge Functions**
2. **Deploy a new function → Via Editor**
3. 이름: **`delete-user`** (정확히 이 이름이어야 앱이 찾습니다)
4. `supabase/functions/delete-user/index.ts` 내용을 **통째로** 붙여넣기 → **Deploy**

키 등록은 필요 없습니다. Supabase가 자동으로 넣어줍니다.

## 시험 계정 정리

Supabase → **Authentication → Users**에서 아래가 보이면 삭제:

- `u-ed858cec8aa4ed8ab8eab384eca095@shihwan87.github.io` (표시 이름 `테스트계정`)
- `u-74657374303031@matjipmap.com`

---

# 배포하기

GitHub Desktop에서 변경사항을 **Commit → Push**하면 끝입니다.
GitHub Actions가 자동으로 빌드·배포합니다.

- 진행 상황: 저장소 **Actions** 탭. 초록불이 되면 반영 완료
- 주소: https://shihwan87.github.io/matjipmap/
- 반영까지 1~2분. 화면이 그대로면 **Ctrl + F5** 로 새로고침

> **DB 구조를 바꾸는 작업은 SQL을 먼저 실행하고 push하세요.**
> 순서가 바뀌면 배포된 앱이 깨집니다. Claude Code가 이 순서를 안내합니다.

---

# 현재 기능

- 지도·목록 탭, 네이버지도 마커, 내 위치 이동
- 이름 또는 이메일 로그인, 3단계 권한(관리자·편집자·열람자)
- 개인별 즐겨찾기 (사람마다 다른 별표)
- 가게 이름 검색으로 등록 (이름·주소·좌표·업종 자동 입력)
- 그룹 다중 선택, 끌어놓기로 순서 변경
- 업종 10종 필터 (그룹 필터와 별개 축)
- 의견 수집 + Claude Code용 마크다운 내보내기
- PWA 설치 (아이폰 사파리 → 공유 → 홈 화면에 추가)
