// 사용자 계정 삭제 함수
//
// 왜 필요한가:
//   계정을 지우려면 Supabase의 "마스터 키"(service role key)가 필요하다.
//   이 키는 모든 권한 검사를 무시할 수 있어 브라우저에 절대 두면 안 된다.
//   그래서 서버 쪽인 이 함수에서만 쓰고, 브라우저는 "이 사람 지워줘"라고
//   요청만 한다. 요청한 사람이 정말 관리자인지는 여기서 직접 확인한다.
//
// 배포 방법은 supabase/functions/README.md 참고.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY는
// Supabase가 자동으로 넣어주므로 따로 등록할 필요가 없다.

import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = ["http://localhost:3000", "https://shihwan87.github.io"];

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ORIGINS = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return json({ error: "서버 설정이 올바르지 않습니다. (service role key 없음)" }, 500);
    }

    // 1) 요청한 사람이 누구인지 확인한다.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return json({ error: "로그인이 필요합니다." }, 401);
    }

    const { userId } = await req.json().catch(() => ({ userId: "" }));
    if (typeof userId !== "string" || !userId) {
      return json({ error: "지울 대상을 찾을 수 없습니다." }, 400);
    }

    // 2) 자기 자신은 지울 수 없다. 관리자가 스스로를 지우면 되돌릴 수 없다.
    if (userId === user.id) {
      return json({ error: "본인 계정은 지울 수 없습니다." }, 400);
    }

    // 3) 요청한 사람이 정말 관리자인지 마스터 키로 직접 확인한다.
    //    (브라우저가 보낸 말을 믿지 않는다)
    const admin = createClient(url, serviceKey);

    const { data: me } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (me?.role !== "admin") {
      return json({ error: "관리자만 계정을 지울 수 있습니다." }, 403);
    }

    // 4) 마지막 남은 관리자는 지울 수 없다. 지우면 아무도 권한을 되돌릴 수 없다.
    const { data: target } = await admin
      .from("profiles")
      .select("role, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (!target) {
      return json({ error: "이미 삭제된 계정입니다." }, 404);
    }

    if (target.role === "admin") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return json({ error: "마지막 관리자는 지울 수 없습니다." }, 400);
      }
    }

    // 5) 삭제. profiles·favorites는 연결이 끊기며 함께 지워지고,
    //    등록한 맛집은 남는다(등록자 표시만 비워진다).
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return json({ error: "삭제에 실패했습니다: " + error.message }, 500);
    }

    return json({ ok: true, deleted: target.display_name ?? userId });
  } catch (e) {
    return json({ error: "처리 중 오류가 발생했습니다.", detail: String(e) }, 500);
  }
});
