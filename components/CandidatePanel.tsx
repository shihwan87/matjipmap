"use client";

import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  Candidate,
  CandidateStatus,
  CANDIDATE_STATUS_LABEL,
  Entry,
  nameKey,
  guessCuisine,
} from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  /** 현재 등록된 맛집 전체. 후보가 올라온 뒤 다른 경로로 등록됐을 수 있어 화면에서도 다시 비교한다 */
  entries: Entry[];
  /** 값이 바뀌면 목록을 다시 불러온다 (등록 완료 후 page.tsx가 올려준다) */
  refreshKey: number;
  /** [등록]을 누르면 호출. page.tsx가 등록 폼을 후보 내용으로 채워 연다 */
  onRegister: (candidate: Candidate) => void;
  onClose: () => void;
};

const FILTERS: CandidateStatus[] = ["pending", "registered", "rejected"];

function shortDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function CandidatePanel({ entries, refreshKey, onRegister, onClose }: Props) {
  const { session } = useAuth();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CandidateStatus>("pending");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(
        error.message.includes("does not exist")
          ? "후보 테이블이 없습니다. supabase/migration-005-candidates.sql을 실행해 주세요."
          : error.message
      );
    }
    setRows((data as Candidate[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);

  // 등록된 맛집의 비교 키. 후보와 같은 키면 "이미 등록됨"으로 표시한다.
  const registeredKeys = useMemo(
    () => new Map(entries.map((e) => [nameKey(e.name), e.id])),
    [entries]
  );

  const visible = rows.filter((r) => r.status === filter);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  /** 상태를 바꾼다. 등록(registered)은 page.tsx가 폼 저장 후 처리하므로 여기서는 제외/되돌리기만. */
  const decide = async (row: Candidate, status: CandidateStatus, entryId: string | null = null) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("candidates")
      .update({
        status,
        entry_id: entryId,
        decided_by: status === "pending" ? null : session?.user.id ?? null,
        decided_at: status === "pending" ? null : now,
        updated_at: now,
      })
      .eq("id", row.id);
    if (error) {
      setError(
        error.message.includes("candidates_pending_name_key")
          ? "같은 상호의 대기중 후보가 이미 있어 되돌릴 수 없습니다."
          : error.message
      );
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status, entry_id: entryId } : r)));
  };

  const cuisineOf = (r: Candidate) => guessCuisine(r.category_raw) ?? r.cuisine_hint ?? "미분류";

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>인스타 후보</h3>

        <div className="filter-row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {CANDIDATE_STATUS_LABEL[f]}{f === "pending" ? ` ${pendingCount}` : ""}
            </button>
          ))}
        </div>

        {loading && <p className="hint">불러오는 중...</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="hint">
            {filter === "pending"
              ? "대기중인 후보가 없습니다. PC에서 tools/insta 스크립트를 돌리면 올라옵니다."
              : "해당하는 후보가 없습니다."}
          </p>
        )}

        {visible.map((row) => {
          const registeredId = registeredKeys.get(row.name_key) ?? null;
          return (
            <div className="fb-row" key={row.id}>
              <div className="fb-head">
                <span className="tag">{cuisineOf(row)}</span>
                {!row.verified && <span className="tag">네이버 미확인</span>}
                {registeredId && row.status === "pending" && <span className="tag">이미 등록됨</span>}
                <span className="fb-meta">{shortDate(row.created_at)}</span>
              </div>
              <p className="fb-body" style={{ marginBottom: 4 }}>
                <b>{row.name}</b>
                {row.address && <><br />{row.address}</>}
                {row.telephone && <><br />{row.telephone}</>}
              </p>
              {/* 출처 포스트. 여러 포스트에서 나온 후보일수록 믿을 만하다 */}
              <p className="hint" style={{ marginTop: 0 }}>
                {row.sources.map((s, i) => (
                  <span key={s.shortcode}>
                    {i > 0 && " · "}
                    <a href={s.post_url} target="_blank" rel="noreferrer">
                      @{s.username ?? "?"} {shortDate(s.posted_at)}
                    </a>
                  </span>
                ))}
                {row.sources[0]?.snippet && (
                  <><br /><span style={{ opacity: 0.8 }}>{row.sources[0].snippet}</span></>
                )}
              </p>
              <div className="fb-actions">
                {row.status === "pending" && registeredId && (
                  // 이미 등록돼 있으니 후보는 그 맛집과 연결해 닫는다
                  <button className="mini-btn" onClick={() => decide(row, "registered", registeredId)}>
                    기등록으로 닫기
                  </button>
                )}
                {row.status === "pending" && !registeredId && (
                  <button className="mini-btn" onClick={() => onRegister(row)}>등록</button>
                )}
                {row.status === "pending" && (
                  <button className="mini-btn" onClick={() => decide(row, "rejected")}>제외</button>
                )}
                {row.status === "rejected" && (
                  <button className="mini-btn" onClick={() => decide(row, "pending")}>대기로 되돌리기</button>
                )}
              </div>
            </div>
          );
        })}

        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
