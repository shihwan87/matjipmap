"use client";

import { useEffect, useState } from "react";
import { supabase, Profile, Role, ROLE_LABEL } from "@/lib/supabaseClient";
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

  const changeRole = async (target: Profile, role: Role) => {
    if (role === target.role) return;

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
              <p className="user-email">{row.email}</p>
            </div>
            <select
              className="sort-select"
              value={row.role}
              disabled={savingId === row.id}
              onChange={(e) => changeRole(row, e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
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
