// 네이버 지역검색(상호명 검색) 중계 함수
//
// 왜 필요한가:
//   네이버 검색 API는 Client Secret 도용을 막기 위해 브라우저에서 직접 호출할 수
//   없도록 막혀 있다(CORS 차단). 우리 앱은 GitHub Pages에 올라가는 정적 사이트라
//   서버가 없으므로, 이 함수가 서버 역할을 대신한다.
//   Secret은 Supabase 환경변수에 보관되어 브라우저로 절대 나가지 않는다.
//
// 배포 방법과 환경변수는 supabase/functions/README.md 참고.

import { createClient } from "jsr:@supabase/supabase-js@2";

// 허용할 접속 출처. 쉼표로 구분해 ALLOWED_ORIGINS 환경변수로 덮어쓸 수 있다.
const DEFAULT_ORIGINS = ["http://localhost:3000", "https://shihwan87.github.io"];

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ORIGINS = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;

function corsHeaders(origin: string | null): Record<string, string> {
  // 등록되지 않은 출처에는 CORS 허용을 내주지 않는다.
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** 검색 결과 제목에 섞여 오는 <b> 태그 등을 제거한다. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 한국 영역 안의 위경도인지 확인한다. */
function inKorea(lat: number, lng: number): boolean {
  return lng >= 124 && lng <= 132 && lat >= 33 && lat <= 43;
}

/**
 * mapx/mapy를 위경도로 바꾼다.
 *
 * 좌표 표기가 시기·상품에 따라 달라서 형식을 값으로 판별한다.
 *   - 소수 표기: 127.0532 (그대로 사용)
 *   - 정수 표기: 1270532000 (10^7로 나눔)
 *   - 과거 KATEC(TM128) 평면좌표: 변환식이 필요해 여기서는 처리하지 않는다
 * 판별에 실패하면 null을 돌려주고, 앱이 주소를 Geocoding해 좌표를 채운다.
 */
function toLatLng(mapx: string, mapy: string): { lat: number; lng: number } | null {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // 1) 이미 소수 위경도로 오는 경우
  if (inKorea(y, x)) return { lat: y, lng: x };

  // 2) 10^7을 곱한 정수로 오는 경우
  const lat = y / 1e7;
  const lng = x / 1e7;
  if (inKorea(lat, lng)) return { lat, lng };

  return null; // 알 수 없는 형식 → 앱에서 주소로 보정
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // NAVER API Hub(NCP)에서 발급받은 검색 API 키.
    // 지도 API 키(ncpKeyId)와는 별개의 값이다.
    const clientId = Deno.env.get("NAVER_SEARCH_CLIENT_ID");
    const clientSecret = Deno.env.get("NAVER_SEARCH_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({ error: "서버에 네이버 검색 API 키가 설정되지 않았습니다." }, 500);
    }

    // 로그인한 사용자만 검색할 수 있게 해 검색 한도를 보호한다.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: "로그인이 필요합니다." }, 401);
    }

    const { query } = await req.json().catch(() => ({ query: "" }));
    if (typeof query !== "string" || !query.trim()) {
      return json({ error: "검색어를 입력해 주세요." }, 400);
    }

    // NAVER API Hub 지역 검색. display 상한이 5다.
    const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
    url.searchParams.set("query", query.trim());
    url.searchParams.set("display", "5");

    const res = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `네이버 검색 실패 (${res.status})`, detail }, 502);
    }

    const data = await res.json();
    const places = (data.items ?? []).map((item: Record<string, string>) => {
      const coord = toLatLng(item.mapx, item.mapy);
      return {
        name: stripTags(item.title ?? ""),
        address: item.roadAddress || item.address || "",
        jibunAddress: item.address || "",
        category: item.category || "",
        telephone: item.telephone || "",
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
      };
    });

    return json({ places });
  } catch (e) {
    return json({ error: "검색 중 오류가 발생했습니다.", detail: String(e) }, 500);
  }
});
