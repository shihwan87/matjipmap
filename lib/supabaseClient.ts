import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);

/** 권한 등급. 위로 갈수록 강함. */
export type Role = "admin" | "editor" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "열람자",
};

export type Entry = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  memo: string | null;
  catchtable_url: string | null;
  group_id: string | null;
  /** 등록한 사용자 id */
  created_by: string | null;
  /** 등록 시점의 표시 이름 스냅샷 (비로그인 방문자에게도 보이도록 저장) */
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
};

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  created_at: string;
};

/** 의견 종류 */
export type FeedbackKind = "bug" | "idea" | "etc";
/** 처리 상태 */
export type FeedbackStatus = "open" | "done" | "wontfix";

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "잘못 동작해요",
  idea: "이런 게 있으면 좋겠어요",
  etc: "그 외",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "미처리",
  done: "반영함",
  wontfix: "보류",
};

export type Feedback = {
  id: string;
  kind: FeedbackKind;
  body: string;
  screen: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};
