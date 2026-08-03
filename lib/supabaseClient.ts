import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);

/**
 * 이름으로 로그인하기 위한 내부 도메인.
 *
 * Supabase 로그인은 이메일이 반드시 있어야 해서, 이름만 쓰는 계정은
 * 이름을 이 도메인의 주소로 바꿔 저장한다. 사용자는 이 주소를 볼 일이 없다.
 * 메일이 실제로 오가지 않도록, 메일 서버가 없는 도메인을 쓴다.
 */
export const ACCOUNT_DOMAIN = "shihwan87.github.io";

/**
 * 이름 → 내부 이메일 주소.
 * 한글·공백이 이메일 형식에 어긋나므로 UTF-8 바이트를 16진수로 바꿔 담는다.
 * 예: "아빠" → "u-ec9584eb998c@shihwan87.github.io"
 */
export function usernameToEmail(name: string): string {
  const normalized = name.trim().normalize("NFC").toLowerCase();
  const hex = Array.from(new TextEncoder().encode(normalized))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `u-${hex}@${ACCOUNT_DOMAIN}`;
}

/** 이름으로 가입한 계정인지 (= 실제 이메일이 없는 계정인지) */
export function isNameAccount(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${ACCOUNT_DOMAIN}`);
}

/** 권한 등급. 위로 갈수록 강함. */
export type Role = "admin" | "editor" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "열람자",
};

/**
 * 업종 큰 분류.
 * 목록 필터 칩으로 쓰이므로 너무 잘게 나누지 않는다.
 * 더 세부적인 분류는 entries.category_raw("음식점>한식>냉면")에 그대로 보관한다.
 * 여기에 항목을 더하거나 빼도 DB는 건드릴 필요가 없다.
 */
export const CUISINES = [
  "한식",
  "중식",
  "일식",
  "양식",
  "아시안",
  "분식",
  "고기·구이",
  "술집",
  "카페·디저트",
  "기타",
] as const;

export type Cuisine = (typeof CUISINES)[number];

/**
 * 네이버 검색이 준 분류 문자열에서 업종을 추정한다.
 * 예: "음식점>한식>냉면" → "한식", "카페,디저트>베이커리" → "카페·디저트"
 * 판단이 안 되면 null을 돌려주고, 사용자가 직접 고르게 한다.
 */
export function guessCuisine(raw: string | null | undefined): Cuisine | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "");

  // 순서가 중요하다. 더 구체적인 것을 먼저 본다
  // (예: "일식>돈까스"는 아래 한식 규칙보다 먼저 걸려야 한다).
  const rules: [RegExp, Cuisine][] = [
    [/카페|디저트|베이커리|제과|빵|아이스크림|빙수|찻집/, "카페·디저트"],
    [/술집|주점|호프|바(\b|>)|포차|이자카야|와인|칵테일|맥주/, "술집"],
    [/중식|중국음식|마라/, "중식"],
    [/일식|초밥|스시|돈까스|돈가스|라멘|우동|이자카야/, "일식"],
    [/양식|이탈리|프렌치|스테이크|파스타|피자|햄버거|브런치/, "양식"],
    [/아시아|베트남|태국|인도|쌀국수|중동|멕시/, "아시안"],
    [/분식|떡볶이|김밥/, "분식"],
    [/육류|고기|구이|갈비|삼겹|곱창|족발|보쌈|치킨|닭/, "고기·구이"],
    [/한식|국밥|찌개|백반|칼국수|냉면|해장|한정식|죽|국수/, "한식"],
  ];

  for (const [re, cuisine] of rules) {
    if (re.test(s)) return cuisine;
  }
  // "음식점"처럼 큰 분류만 온 경우는 단정하지 않는다
  return null;
}

export type Entry = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  memo: string | null;
  catchtable_url: string | null;
  /**
   * 그룹은 여러 개 붙을 수 있어 이 타입에 담지 않는다.
   * entry_groups 테이블을 따로 읽어 Map<entryId, groupId[]> 형태로 다룬다.
   */
  /** 업종 큰 분류. 맛집 하나에 하나만. 검색 등록 시 자동 추정되고 수정 가능 */
  cuisine: string | null;
  /** 네이버 검색이 준 원본 분류 문자열 (표시용) */
  category_raw: string | null;
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
  /** 목록에 보여줄 순서. 그룹 관리 화면에서 바꾼다 */
  sort_order: number;
};

/** 맛집 ↔ 그룹 연결 한 줄 */
export type EntryGroup = {
  entry_id: string;
  group_id: string;
};

/** 맛집 id → 그룹 id 목록 */
export type GroupMap = Map<string, string[]>;

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
