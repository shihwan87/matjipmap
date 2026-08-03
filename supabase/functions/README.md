# Supabase 중계 함수 설정

이 폴더에는 브라우저가 직접 할 수 없는 일을 대신 처리하는 작은 서버 프로그램 두 개가 있습니다.

| 함수 | 하는 일 | 필요한 경우 |
|---|---|---|
| `search-place` | 가게 이름 검색 | 등록 폼의 "가게 이름으로 검색" |
| `delete-user` | 계정 삭제 | 관리 화면의 "삭제" 버튼 |

각각 따로 배포합니다. 배포하지 않아도 나머지 기능은 모두 정상 동작합니다.

---

# delete-user — 계정 삭제

## 왜 필요한가

계정을 지우려면 Supabase의 **마스터 키**가 필요합니다. 이 키는 모든 권한 검사를 무시할 수
있어서 브라우저에 두면 누구나 훔쳐 쓸 수 있습니다. 그래서 서버 쪽인 이 함수에서만 쓰고,
브라우저는 "이 사람 지워줘"라고 요청만 합니다. 요청한 사람이 정말 관리자인지는 함수가
직접 확인합니다.

## 배포

1. Supabase 대시보드 → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 함수 이름: **`delete-user`** ← 정확히 이 이름
3. `supabase/functions/delete-user/index.ts` 내용을 통째로 붙여넣기 → **Deploy**

키는 따로 등록할 필요가 없습니다. Supabase가 자동으로 넣어줍니다.

## 안전장치

- 관리자가 아니면 거부합니다 (브라우저가 보낸 말을 믿지 않고 서버에서 확인)
- **본인 계정은 지울 수 없습니다**
- **마지막 남은 관리자는 지울 수 없습니다** (지우면 아무도 권한을 되돌릴 수 없음)
- 지운 사람이 **등록한 맛집은 남습니다**. 즐겨찾기와 의견은 함께 사라집니다.

---

# search-place — 가게 이름 검색 설정

등록 폼의 **"가게 이름으로 검색"**을 쓰려면 이 설정이 필요합니다.
설정하지 않아도 나머지 기능(지도 클릭, 주소로 좌표 찾기, 등록·수정)은 모두 정상 동작합니다.

## 왜 중계 프로그램이 필요한가

네이버 검색 API는 **서버에서만 호출할 수 있습니다.** 열쇠 도용을 막으려고 브라우저에서
직접 부르지 못하게 막아뒀기 때문입니다. (검색 API 신청 화면에 "웹 서비스 URL" 항목이
없는 것도 같은 이유입니다 — 도메인 대신 열쇠로 인증합니다.)

우리 앱은 GitHub Pages에 올라가는 정적 사이트라 서버가 없습니다.
그래서 이미 쓰고 있는 **Supabase에 아주 작은 중계 프로그램**을 하나 올립니다.
브라우저가 Supabase에 물어보면 Supabase가 네이버에 대신 물어보고 결과만 돌려주는 방식입니다.
열쇠는 Supabase 안에만 있고 브라우저로 절대 나가지 않습니다.

---

## 1단계. 검색 API 신청 — NAVER API Hub

검색 API는 **NCP(ncloud.com)의 NAVER API Hub** 상품으로 옮겨졌습니다.
예전 developers.naver.com 경로는 더 이상 쓰지 않습니다.

1. https://www.ncloud.com/product/applicationService/naverApiHub 접속
2. 이용 신청 → **검색** API 선택
3. 발급된 **Client ID**와 **Client Secret** 복사

> 지도 API 키(`ncpKeyId`)와는 **다른 값**입니다. 헷갈리지 마세요.
> "웹 서비스 URL" 입력란이 없는 것이 정상입니다.

## 2단계. Supabase에 열쇠 보관

Supabase 대시보드 → 좌측 **Edge Functions → Secrets**
(버전에 따라 Project Settings → Edge Functions 아래에 있을 수 있습니다)

| 이름 | 값 |
|---|---|
| `NAVER_SEARCH_CLIENT_ID` | 1단계의 Client ID |
| `NAVER_SEARCH_CLIENT_SECRET` | 1단계의 Client Secret |
| `ALLOWED_ORIGINS` | `http://localhost:3000,https://shihwan87.github.io` |

`ALLOWED_ORIGINS`는 생략해도 됩니다(위 두 주소가 기본값).

## 3단계. 중계 함수 올리기

### 방법 A. Supabase 대시보드 (설치할 것 없음, 권장)

1. 대시보드 → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 함수 이름: **`search-place`** ← 정확히 이 이름이어야 앱이 찾습니다
3. 편집기 내용을 전부 지우고 `supabase/functions/search-place/index.ts` 내용을 **통째로** 붙여넣기
4. **Deploy**

### 방법 B. 명령어 (Supabase CLI 필요)

```bash
npx supabase login
npx supabase link --project-ref hwrzytnrknpsesmgqhrc
npx supabase functions deploy search-place
```

## 4단계. 확인

앱에서 **로그인한 뒤** 등록 폼을 열고 가게 이름을 검색해 보세요.

| 화면에 나오는 메시지 | 원인과 해결 |
|---|---|
| 결과가 잘 나옴 | 완료 |
| `서버에 네이버 검색 API 키가 설정되지 않았습니다` | 2단계 Secrets 미등록 |
| `로그인이 필요합니다` | 로그아웃 상태. 로그인 후 재시도 |
| `검색에 실패했습니다` | 3단계 함수 배포 안 됨, 또는 함수 이름 오타 |
| `네이버 검색 실패 (401)` | 1단계 키가 틀렸거나 검색 API 미신청 |

---

## 호출 규격 (참고)

```
GET https://naverapihub.apigw.ntruss.com/search/v1/local?query=...&display=5
헤더: X-NCP-APIGW-API-KEY-ID, X-NCP-APIGW-API-KEY
```

- 한 번에 **최대 5건**까지만 돌려줍니다. 검색어를 구체적으로 넣으면 정확도가 올라갑니다
  (예: `밀도` 보다 `성수동 밀도`).
- 좌표(mapx/mapy)는 표기 형식이 상품·시기에 따라 달라, 함수가 소수·정수 두 형식을 모두
  판별합니다. 판별에 실패하면 앱이 주소를 Geocoding해 좌표를 채웁니다.
- 검색은 **로그인한 사용자만** 쓸 수 있습니다. 검색 한도를 보호하기 위한 제한입니다.
