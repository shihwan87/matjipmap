"use client";

import { useEffect, useState } from "react";
import { supabase, Profile, Role, ROLE_LABEL, isNameAccount } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

const ROLES: Role[] = ["admin", "editor", "viewer"];

const ROLE_HELP: Record<Role, string> = {
  admin: "모든 권한 + 사용자 관리",
  editor: "맛집 등록·수정·삭제 가능",
  viewer: "보기 + 개인 즐겨찾기만",
};

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    setRows((data as Profile[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * 계정 삭제.
   * 계정 삭제에는 마스터 키가 필요해 브라우저에서 직접 할 수 없다.
   * Supabase 중계 함수(delete-user)에 요청하고, 권한 확인은 그쪽에서 한다.
   */
  const removeUser = async (target: Profile) => {
    if (target.id === me?.id) {
      alert("본인 계정은 지울 수 없습니다.");
      return;
    }
    const name = target.display_name || "이 사용자";
    const ok = confirm(
      `${name} 계정을 삭제할까요?\n\n` +
        `· 이 사람이 등록한 맛집은 지워지지 않습니다\n` +
        `· 이 사람의 즐겨찾기와 의견은 함께 사라집니다\n` +
        `· 되돌릴 수 없습니다`
    );
    if (!ok) return;

    setSavingId(target.id);
    setError(null);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: target.id },
    });
    setSavingId(null);

    if (error) {
      // 함수가 배포되지 않았거나 서버가 거절한 경우
      let message = "삭제에 실패했습니다. (관리자: delete-user 함수 배포 필요)";
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // 응답 본문을 읽을 수 없으면 기본 메시지 유지
      }
      setError(message);
      return;
    }
    if (data?.error) { setError(data.error); return; }

    setRows((prev) => prev.filter((r) => r.id !== target.id));
  };

  const changeRole = async (target: Profile, role: Role) => {
    if (role === target.role) return;

    // 관리자는 실제 이메일로 가입한 계정만 될 수 있다 (DB에서도 같은 규칙을 강제한다).
    if (role === "admin" && isNameAccount(target.email)) {
      alert("이름으로 가입한 계정은 관리자가 될 수 없습니다.\n\n관리자 권한이 필요하면 이메일로 새로 가입해 주세요.");
      return;
    }

    // 관리자가 자기 자신을 강등하면 아무도 권한을 되돌릴 수 없게 될 수 있다.
    if (target.id === me?.id) {
      const otherAdmins = rows.filter((r) => r.role === "admin" && r.id !== target.id).length;
      if (otherAdmins === 0) {
        alert("유일한 관리자입니다. 다른 사람을 먼저 관리자로 지정한 뒤 변경해 주세요.");
        return;
      }
      if (!confirm("본인의 권한을 낮추면 이 화면에 다시 들어올 수 없습니다. 계속할까요?")) return;
    }

    setSavingId(target.id);
    setError(null);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", target.id);
    setSavingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === target.id ? { ...r, role } : r)));
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>사용자 권한 관리</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          새로 가입한 사람은 자동으로 <b>열람자</b>가 됩니다. 맛집을 등록하게 하려면 <b>편집자</b>로 올려주세요.
        </p>

        {loading && <p className="hint">불러오는 중...</p>}
        {error && <p className="form-error">{error}</p>}

        {rows.map((row) => (
          <div className="user-row" key={row.id}>
            <div className="user-main">
              <p className="user-name">
                {row.display_name || "(이름 없음)"}
                {row.id === me?.id && <span className="tag" style={{ marginLeft: 6 }}>나</span>}
              </p>
              <p className="user-email">
                {isNameAccount(row.email) ? "이름으로 가입" : row.email}
              </p>
            </div>
            <select
              className="sort-select"
              value={row.role}
              disabled={savingId === row.id}
              onChange={(e) => changeRole(row, e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r} disabled={r === "admin" && isNameAccount(row.email)}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {/* 본인 계정은 실수로 지우지 못하도록 버튼 자체를 감춘다 */}
            {row.id !== me?.id && (
              <button
                className="mini-btn"
                onClick={() => removeUser(row)}
                disabled={savingId === row.id}
              >
                삭제
              </button>
            )}
          </div>
        ))}

        <div className="role-legend">
          {ROLES.map((r) => (
            <p key={r} className="hint" style={{ margin: "2px 0" }}>
              <b>{ROLE_LABEL[r]}</b> — {ROLE_HELP[r]}
            </p>
          ))}
        </div>

        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
