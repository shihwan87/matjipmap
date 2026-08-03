"use client";

import { useState } from "react";
import { supabase, FeedbackKind, FEEDBACK_KIND_LABEL } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  /** 의견을 남긴 시점의 화면 (재현에 도움이 된다) */
  screen: "map" | "list";
  onClose: () => void;
  onRequireLogin: () => void;
};

const KINDS: FeedbackKind[] = ["bug", "idea", "etc"];

export default function FeedbackPanel({ screen, onClose, onRequireLogin }: Props) {
  const { session, profile } = useAuth();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!session) {
      onRequireLogin();
      return;
    }
    if (!body.trim()) {
      setError("내용을 적어주세요.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.from("feedback").insert({
      kind,
      body: body.trim(),
      screen,
      // 기기·브라우저 정보. 특정 기기에서만 생기는 문제를 가릴 때 쓴다.
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      created_by: session.user.id,
      created_by_name: profile?.display_name ?? null,
    });

    setSaving(false);
    if (error) {
      setError(
        error.message.includes("does not exist")
          ? "의견 기능이 아직 설정되지 않았습니다. (관리자: migration-002-feedback.sql 실행 필요)"
          : error.message
      );
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>보내주셔서 감사합니다</h3>
          <p className="hint">
            남겨주신 의견은 관리자에게 전달됩니다. 반영되면 앱이 자동으로 업데이트돼요.
          </p>
          <button className="btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>의견 보내기</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          불편한 점이나 있으면 좋겠다 싶은 기능을 편하게 적어주세요.
        </p>

        <div className="field">
          <label>어떤 이야기인가요?</label>
          <div className="kind-row">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${kind === k ? "active" : ""}`}
                onClick={() => setKind(k)}
              >
                {FEEDBACK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              kind === "bug"
                ? "예: 목록에서 삭제를 눌렀는데 화면이 그대로예요"
                : "예: 사진도 같이 올릴 수 있으면 좋겠어요"
            }
            style={{ minHeight: 110 }}
          />
          <p className="hint">
            어떤 화면에서 무엇을 눌렀을 때 그랬는지 적어주시면 고치기가 훨씬 쉬워요.
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary" disabled={saving || !body.trim()} onClick={submit}>
          {saving ? "보내는 중..." : "보내기"}
        </button>
        <button className="btn-ghost" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}
