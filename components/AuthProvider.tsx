"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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

  // 로그인한 사용자의 프로필(역할)을 가져온다.
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile((data as Profile) || null);
  }, []);

  useEffect(() => {
    // 새로고침 후에도 로그인 상태를 복구
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setReady(true);
    });

    // 로그인/로그아웃 시 상태 갱신
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      await loadProfile(next?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

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
