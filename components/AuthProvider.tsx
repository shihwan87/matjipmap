"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, Profile, Role } from "@/lib/supabaseClient";

type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  /** 로그인하지 않았으면 "anon" */
  role: Role | "anon";
  /** 맛집 등록·수정·삭제 권한 (편집자 이상) */
  canEdit: boolean;
  /** 사용자 역할 관리 권한 (관리자) */
  isAdmin: boolean;
  /** 최초 세션 확인이 끝났는지 — 끝나기 전에는 로그인 버튼을 깜빡이지 않게 한다 */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const userId = session?.user?.id;

  // 세션 추적.
  // 주의: onAuthStateChange 콜백 안에서 supabase 호출을 await 하면 인증 라이브러리
  // 내부 잠금과 얽혀 응답이 오지 않을 수 있다(탭이 여러 개일 때 특히). 그래서 여기서는
  // 상태만 동기적으로 바꾸고, 프로필 조회는 아래 별도 effect에서 처리한다.
  useEffect(() => {
    let alive = true;

    // 구독 즉시 INITIAL_SESSION 이벤트로 현재 세션이 전달된다.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setReady(true);
    });

    // 보조 경로 — 위 이벤트가 오지 않는 경우에도 화면이 멈추지 않도록.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
      })
      .catch(() => {
        // 네트워크 실패 등으로 세션 확인이 안 되면 비로그인으로 간주하고 진행한다.
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    // 최후의 안전장치: 어떤 이유로든 위 두 경로가 모두 응답하지 않아도
    // 로그인 버튼이 사라진 채로 남지 않게 한다.
    const fallback = setTimeout(() => {
      if (alive) setReady(true);
    }, 3000);

    return () => {
      alive = false;
      clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 로그인한 사용자의 프로필(역할)을 가져온다. 세션이 바뀔 때만 실행된다.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let alive = true;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      // 가입 직후 등 프로필 행이 아직 없을 수 있으므로 single() 대신 maybeSingle()
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile((data as Profile) ?? null);
      });
    return () => { alive = false; };
  }, [userId]);

  // 아래 세 함수는 실패 시 사용자에게 보여줄 한국어 메시지를, 성공 시 null을 반환한다.
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (error.message.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (error.message.includes("Email not confirmed")) return "이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.";
    return error.message;
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // display_name은 가입 트리거가 profiles에 복사한다.
      options: { data: { display_name: displayName.trim() || email.split("@")[0] } },
    });
    if (!error) return null;
    if (error.message.includes("already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (error.message.includes("at least")) return "비밀번호는 6자 이상이어야 합니다.";
    return error.message;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const role: Role | "anon" = profile?.role ?? "anon";

  const value: AuthValue = {
    session,
    profile,
    role,
    canEdit: role === "admin" || role === "editor",
    isAdmin: role === "admin",
    ready,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
