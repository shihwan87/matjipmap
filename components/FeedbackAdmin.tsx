"use client";

import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  Feedback,
  FeedbackStatus,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL,
} from "@/lib/supabaseClient";

const STATUSES: FeedbackStatus[] = ["open", "done", "wontfix"];

/** 긴 userAgent 문자열에서 사람이 읽을 만한 부분만 뽑는다. */
function shortDevice(ua: string | null): string {
  if (!ua) return "알 수 없음";
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "Mac"
    : "기타";
  // Chrome 판별을 Safari보다 먼저 해야 한다 (Chrome UA에도 Safari가 들어있다)
  const browser = /Edg\//.test(ua) ? "Edge"
    : /CriOS|Chrome/.test(ua) ? "Chrome"
    : /Firefox/.test(ua) ? "Firefox"
    : /Safari/.test(ua) ? "Safari"
    : "기타";
  return `${os} · ${browser}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 모아둔 의견을 Claude Code에 그대로 붙여넣을 수 있는 마크다운으로 만든다.
 * 사람이 읽기 좋은 형태이면서, 무엇을 해달라는 것인지 지시까지 포함한다.
 */
function buildMarkdown(rows: Feedback[]): string {
  const now = formatDate(new Date().toISOString());
  const lines: string[] = [];

  lines.push("# 맛집지도 사용자 의견");
  lines.push("");
  lines.push(`생성 시각: ${now} · 대상 ${rows.length}건`);
  lines.push("");
  lines.push("## 작업 지시");
  lines.push("");
  lines.push("아래는 실제 사용자가 앱에서 남긴 의견입니다. 각 항목에 대해:");
  lines.push("");
  lines.push("1. 코드에서 원인을 찾아 고쳐주세요.");
  lines.push("2. 고칠 수 없거나 고치지 않는 편이 낫다면 이유를 알려주세요.");
  lines.push("3. DB 구조 변경이 필요하면 마이그레이션 SQL도 함께 만들어주세요.");
  lines.push("");
  lines.push("작업 후 `npm run build`로 검증하고, 무엇을 고쳤는지 항목별로 정리해주세요.");
  lines.push("");
  lines.push("---");
  lines.push("");

  rows.forEach((r, i) => {
    const screen = r.screen === "map" ? "지도 화면" : r.screen === "list" ? "목록 화면" : "알 수 없음";
    lines.push(`### ${i + 1}. [${FEEDBACK_KIND_LABEL[r.kind]}] ${screen}`);
    lines.push("");
    lines.push(r.body.trim());
    lines.push("");
    lines.push(`- 보낸이: ${r.created_by_name || "이름 없음"}`);
    lines.push(`- 시각: ${formatDate(r.created_at)}`);
    lines.push(`- 기기: ${shortDevice(r.user_agent)}`);
    lines.push(`- 상태: ${FEEDBACK_STATUS_LABEL[r.status]}`);
    lines.push("");
  });

  return lines.join("\n");
}

export default function FeedbackAdmin({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("open");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(
        error.message.includes("does not exist")
          ? "의견 테이블이 없습니다. supabase/migration-002-feedback.sql을 실행해 주세요."
          : error.message
      );
    }
    setRows((data as Feedback[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  const changeStatus = async (row: Feedback, status: FeedbackStatus) => {
    const { error } = await supabase.from("feedback").update({ status }).eq("id", row.id);
    if (error) { setError(error.message); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
  };

  const remove = async (row: Feedback) => {
    if (!confirm("이 의견을 삭제할까요?")) return;
    const { error } = await supabase.from("feedback").delete().eq("id", row.id);
    if (error) { setError(error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const copyMarkdown = async () => {
    if (visible.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(visible));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("클립보드 복사에 실패했습니다. 아래 [파일로 저장]을 이용해 주세요.");
    }
  };

  const downloadMarkdown = () => {
    if (visible.length === 0) return;
    const blob = new Blob([buildMarkdown(visible)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `matjipmap-feedback-${stamp}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>받은 의견</h3>

        <div className="filter-row" style={{ marginBottom: 12 }}>
          <button className={`chip ${filter === "open" ? "active" : ""}`} onClick={() => setFilter("open")}>
            미처리 {rows.filter((r) => r.status === "open").length}
          </button>
          <button className={`chip ${filter === "done" ? "active" : ""}`} onClick={() => setFilter("done")}>반영함</button>
          <button className={`chip ${filter === "wontfix" ? "active" : ""}`} onClick={() => setFilter("wontfix")}>보류</button>
          <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>전체</button>
        </div>

        {loading && <p className="hint">불러오는 중...</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && visible.length === 0 && <p className="hint">해당하는 의견이 없습니다.</p>}

        {visible.map((row) => (
          <div className="fb-row" key={row.id}>
            <div className="fb-head">
              <span className="tag">{FEEDBACK_KIND_LABEL[row.kind]}</span>
              <span className="fb-meta">
                {row.created_by_name || "이름 없음"} · {formatDate(row.created_at)} · {shortDevice(row.user_agent)}
              </span>
            </div>
            <p className="fb-body">{row.body}</p>
            <div className="fb-actions">
              <select
                className="sort-select"
                value={row.status}
                onChange={(e) => changeStatus(row, e.target.value as FeedbackStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>
                ))}
              </select>
              <button className="mini-btn" onClick={() => remove(row)}>삭제</button>
            </div>
          </div>
        ))}

        <div className="export-box">
          <p className="hint" style={{ marginTop: 0 }}>
            <b>Claude Code로 넘기기</b> — 위에 보이는 {visible.length}건을 작업 지시가 포함된
            마크다운으로 만들어 줍니다.
          </p>
          <div className="input-with-btn">
            <button className="mini-btn" onClick={copyMarkdown} disabled={visible.length === 0}>
              {copied ? "복사됨!" : "클립보드에 복사"}
            </button>
            <button className="mini-btn" onClick={downloadMarkdown} disabled={visible.length === 0}>
              파일로 저장 (.md)
            </button>
          </div>
          <p className="hint">
            파일로 저장한 뒤 프로젝트 폴더에 넣고 Claude Code에 <b>“feedback 파일 보고 고쳐줘”</b>라고
            말하면 됩니다.
          </p>
        </div>

        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
