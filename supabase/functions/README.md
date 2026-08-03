# 가게 이름 검색 기능 설정

등록 폼의 **"가게 이름으로 검색"**을 쓰려면 이 설정이 필요합니다.
설정하지 않아도 나머지 기능(지도 클릭, 주소로 좌표 찾기, 등록·수정)은 모두 정상 동작합니다.

## 왜 이런 게 필요한가

네이버 검색 API는 열쇠(Client Secret) 도용을 막으려고 **브라우저에서 직접 부르지 못하게** 막아뒀습니다.
반드시 서버를 거쳐야 하는데, 우리 앱은 GitHub Pages에 올라가는 정적 사이트라 서버가 없습니다.

그래서 이미 쓰고 있는 **Supabase에 아주 작은 중계 프로그램**을 하나 올립니다.
브라우저가 Supabase에 물어보면, Supabase가 네이버에 대신 물어보고 결과만 돌려주는 방식입니다.
열쇠는 Supabase 안에만 있고 브라우저로 절대 나가지 않습니다.

---

## 1단계. 네이버 검색 API 키 발급 (카드 불필요)

지도 API(NCP)와는 **다른 서비스**입니다. 별도로 발급받아야 합니다.

1. https://developers.naver.com 접속 → 네이버 계정으로 로그인
2. **Application → 애플리케이션 등록**
3. 애플리케이션 이름: `맛집지도`
4. 사용 API에서 **검색** 선택
5. 환경 추가: **WEB 설정** → 서비스 URL에 `https://shihwan87.github.io` 입력
6. 등록하면 나오는 **Client ID**와 **Client Secret** 복사

> 검색 API는 무료이며 하루 호출 한도가 넉넉합니다. 가족 단위 사용은 한도에 닿지 않습니다.

## 2단계. Supabase에 열쇠 보관

Supabase 대시보드 → **Edge Functions → Secrets** (또는 Project Settings → Edge Functions)

| 이름 | 값 |
|---|---|
| `NAVER_SEARCH_CLIENT_ID` | 1단계의 Client ID |
| `NAVER_SEARCH_CLIENT_SECRET` | 1단계의 Client Secret |
| `ALLOWED_ORIGINS` | `http://localhost:3000,https://shihwan87.github.io` |

`ALLOWED_ORIGINS`는 생략해도 됩니다(위 두 주소가 기본값).

## 3단계. 중계 함수 올리기

### 방법 A. Supabase 대시보드 (설치할 것 없음)

1. Supabase 대시보드 → **Edge Functions** → **Create a new function**
2. 이름: `search-place`
3. 편집 창에 `supabase/functions/search-place/index.ts` 파일 내용을 **전체 복사해 붙여넣기**
4. **Deploy** 클릭

### 방법 B. 명령어 (Supabase CLI 설치 필요)

```bash
npx supabase login
npx supabase link --project-ref hwrzytnrknpsesmgqhrc
npx supabase functions deploy search-place
```

## 4단계. 확인

앱에서 로그인한 뒤 등록 폼을 열고, 가게 이름을 넣어 **검색**을 눌러보세요.

| 화면에 나오는 메시지 | 원인과 해결 |
|---|---|
| 결과가 잘 나옴 | 완료 |
| `서버에 네이버 검색 API 키가 설정되지 않았습니다` | 2단계 Secrets 미등록 |
| `로그인이 필요합니다` | 로그아웃 상태. 로그인 후 재시도 |
| `검색에 실패했습니다` | 3단계 함수 배포가 안 됨 |

---

## 참고

- 지역검색 API는 **한 번에 최대 5건**까지만 돌려줍니다. 검색어를 구체적으로 넣으면 정확도가 올라갑니다
  (예: `밀도` 보다 `성수동 밀도`).
- 검색 결과의 좌표 형식이 예상과 다르면, 앱이 자동으로 주소를 Geocoding해서 좌표를 채웁니다.
- 검색은 **로그인한 사용자만** 쓸 수 있습니다. 검색 한도를 보호하기 위한 제한입니다.
