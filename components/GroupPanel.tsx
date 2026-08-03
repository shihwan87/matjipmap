"use client";

import { useMemo, useState } from "react";
import { supabase, Entry, Group } from "@/lib/supabaseClient";

type Props = {
  groups: Group[];
  /** 그룹별 사용 개수를 세기 위해 필요 */
  entries: Entry[];
  /** 추가·수정·삭제 후 목록을 다시 불러오기 위한 콜백 */
  onChanged: () => void;
  onClose: () => void;
};

export default function GroupPanel({ groups, entries, onChanged, onClose }: Props) {
  const [newName, setNewName] = useState("");
  // 이름을 고치는 중인 값. { 그룹id: 입력값 }
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 그룹마다 몇 곳이 들어있는지 (삭제 시 영향 범위를 보여주기 위해)
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.group_id) map[e.group_id] = (map[e.group_id] ?? 0) + 1;
    });
    return map;
  }, [entries]);

  const nameExists = (name: string, exceptId?: string) =>
    groups.some((g) => g.id !== exceptId && g.name.trim() === name.trim());

  const fail = (e: { message: string }) => {
    setError(
      e.message.includes("row-level security")
        ? "그룹을 바꿀 권한이 없습니다. 관리자에게 편집자 권한을 요청해 주세요."
        : e.message
    );
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    if (nameExists(name)) {
      setError("같은 이름의 그룹이 이미 있습니다.");
      return;
    }
    setBusyId("new");
    setError(null);
    // 새 그룹은 맨 뒤에 붙인다
    const nextOrder = Math.max(0, ...groups.map((g) => g.sort_order ?? 0)) + 1;
    const { error } = await supabase.from("groups").insert({ name, sort_order: nextOrder });
    setBusyId(null);
    if (error) { fail(error); return; }
    setNewName("");
    onChanged();
  };

  /**
   * 순서를 한 칸 옮긴다.
   * 이웃한 두 그룹의 sort_order를 맞바꾸는 방식이라 전체를 다시 쓰지 않아도 된다.
   */
  const move = async (index: number, dir: -1 | 1) => {
    const target = groups[index];
    const swap = groups[index + dir];
    if (!target || !swap) return;

    setBusyId(target.id);
    setError(null);
    const [a, b] = [target.sort_order ?? 0, swap.sort_order ?? 0];
    // 두 값이 같으면 맞바꿔도 순서가 안 바뀌므로 서로 다른 값을 만들어 준다.
    const [newA, newB] = a === b ? [b + dir, a] : [b, a];

    const r1 = await supabase.from("groups").update({ sort_order: newA }).eq("id", target.id);
    const r2 = await supabase.from("groups").update({ sort_order: newB }).eq("id", swap.id);
    setBusyId(null);
    if (r1.error) { fail(r1.error); return; }
    if (r2.error) { fail(r2.error); return; }
    onChanged();
  };

  const rename = async (group: Group) => {
    const name = (drafts[group.id] ?? "").trim();
    if (!name || name === group.name) return;
    if (nameExists(name, group.id)) {
      setError("같은 이름의 그룹이 이미 있습니다.");
      return;
    }
    setBusyId(group.id);
    setError(null);
    const { error } = await supabase.from("groups").update({ name }).eq("id", group.id);
    setBusyId(null);
    if (error) { fail(error); return; }
    setDrafts((d) => { const next = { ...d }; delete next[group.id]; return next; });
    onChanged();
  };

  const remove = async (group: Group) => {
    const used = counts[group.id] ?? 0;
    const message = used > 0
      ? `"${group.name}" 그룹을 삭제할까요?\n\n이 그룹에 속한 맛집 ${used}곳은 지워지지 않고, 그룹만 "없음"이 됩니다.`
      : `"${group.name}" 그룹을 삭제할까요?`;
    if (!confirm(message)) return;

    setBusyId(group.id);
    setError(null);
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    setBusyId(null);
    if (error) { fail(error); return; }
    onChanged();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>그룹 관리</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          맛집을 묶는 분류입니다. 지역(강남, 성수)이나 상황(가족 외식, 데이트)처럼 편한 대로 만드세요.
        </p>

        <div className="field">
          <label>새 그룹 추가</label>
          <div className="input-with-btn">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="예: 성수동, 주말 나들이"
            />
            <button className="mini-btn" onClick={add} disabled={busyId === "new" || !newName.trim()}>
              추가
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="field">
          <label>기존 그룹</label>
          {groups.length === 0 && <p className="hint">아직 그룹이 없습니다.</p>}

          {groups.map((g, i) => {
            const draft = drafts[g.id] ?? g.name;
            const changed = draft.trim() !== g.name && draft.trim() !== "";
            const used = counts[g.id] ?? 0;
            return (
              <div className="group-row" key={g.id}>
                <div className="order-btns">
                  <button
                    className="order-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busyId === g.id}
                    title="위로"
                    aria-label="위로"
                  >
                    ▲
                  </button>
                  <button
                    className="order-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === groups.length - 1 || busyId === g.id}
                    title="아래로"
                    aria-label="아래로"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(g); } }}
                />
                <span className="group-count">{used}곳</span>
                <button
                  className="mini-btn"
                  onClick={() => rename(g)}
                  disabled={!changed || busyId === g.id}
                >
                  저장
                </button>
                <button className="mini-btn" onClick={() => remove(g)} disabled={busyId === g.id}>
                  삭제
                </button>
              </div>
            );
          })}
        </div>

        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
