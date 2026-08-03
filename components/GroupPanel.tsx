"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, Group, GroupMap } from "@/lib/supabaseClient";

type Props = {
  groups: Group[];
  /** 맛집 id → 그룹 id 목록. 그룹별 사용 개수를 세는 데 쓴다 */
  groupMap: GroupMap;
  /** 추가·수정·삭제 후 목록을 다시 불러오기 위한 콜백 */
  onChanged: () => void;
  onClose: () => void;
};

export default function GroupPanel({ groups, groupMap, onChanged, onClose }: Props) {
  const [newName, setNewName] = useState("");
  // 이름을 고치는 중인 값. { 그룹id: 입력값 }
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 끌어서 옮기는 동안에는 화면을 먼저 바꾸고, 손을 뗄 때 서버에 저장한다.
  const [rows, setRows] = useState<Group[]>(groups);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 바깥에서 목록이 갱신되면(추가·삭제 등) 화면 순서도 맞춘다.
  useEffect(() => {
    if (!dragId) setRows(groups);
  }, [groups, dragId]);

  // 그룹마다 몇 곳이 들어있는지 (삭제 시 영향 범위를 보여주기 위해)
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    groupMap.forEach((ids) => {
      ids.forEach((id) => { map[id] = (map[id] ?? 0) + 1; });
    });
    return map;
  }, [groupMap]);

  const nameExists = (name: string, exceptId?: string) =>
    rows.some((g) => g.id !== exceptId && g.name.trim() === name.trim());

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
    const nextOrder = Math.max(0, ...rows.map((g) => g.sort_order ?? 0)) + 1;
    const { error } = await supabase.from("groups").insert({ name, sort_order: nextOrder });
    setBusyId(null);
    if (error) { fail(error); return; }
    setNewName("");
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
      ? `"${group.name}" 그룹을 삭제할까요?\n\n이 그룹에 속한 맛집 ${used}곳은 지워지지 않고, 이 그룹 표시만 사라집니다.`
      : `"${group.name}" 그룹을 삭제할까요?`;
    if (!confirm(message)) return;

    setBusyId(group.id);
    setError(null);
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    setBusyId(null);
    if (error) { fail(error); return; }
    onChanged();
  };

  /** 화면에 보이는 순서대로 sort_order를 1,2,3...으로 다시 매겨 저장한다. */
  const persistOrder = async (ordered: Group[]) => {
    const payload = ordered.map((g, i) => ({ id: g.id, name: g.name, sort_order: i + 1 }));
    const { error } = await supabase.from("groups").upsert(payload);
    if (error) { fail(error); onChanged(); return; }
    onChanged();
  };

  /** 배열에서 from 위치의 항목을 to 위치로 옮긴 새 배열을 만든다. */
  const moveItem = (list: Group[], from: number, to: number): Group[] => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  /** 포인터 y좌표가 어느 행 위에 있는지 찾는다. */
  const indexAt = (y: number): number => {
    const el = listRef.current;
    if (!el) return -1;
    const children = Array.from(el.querySelectorAll<HTMLElement>("[data-row]"));
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      // 행의 중간선을 넘어가면 그 자리로 옮긴다
      if (y < r.top + r.height / 2) return i;
    }
    return children.length - 1;
  };

  // 마우스·터치를 함께 다루기 위해 포인터 이벤트를 쓴다.
  // (HTML 기본 드래그는 아이폰 사파리에서 동작하지 않는다)
  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setError(null);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    e.preventDefault();
    const from = rows.findIndex((g) => g.id === dragId);
    const to = indexAt(e.clientY);
    if (from < 0 || to < 0 || from === to) return;
    setRows((prev) => moveItem(prev, from, to));
  };

  const onHandleUp = async () => {
    if (!dragId) return;
    const ordered = rows;
    setDragId(null);
    // 순서가 실제로 바뀌었을 때만 저장한다
    const changed = ordered.some((g, i) => groups[i]?.id !== g.id);
    if (changed) await persistOrder(ordered);
  };

  /** 키보드로도 옮길 수 있게 한다 (손가락·마우스가 어려운 경우 대비) */
  const onHandleKey = async (e: React.KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const to = index + dir;
    if (to < 0 || to >= rows.length) return;
    const next = moveItem(rows, index, to);
    setRows(next);
    await persistOrder(next);
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
          {rows.length === 0 && <p className="hint">아직 그룹이 없습니다.</p>}
          {rows.length > 1 && (
            <p className="hint" style={{ marginTop: 0 }}>
              왼쪽 손잡이(⠿)를 끌어서 순서를 바꿀 수 있어요.
            </p>
          )}

          <div ref={listRef}>
            {rows.map((g, i) => {
              const draft = drafts[g.id] ?? g.name;
              const changed = draft.trim() !== g.name && draft.trim() !== "";
              const used = counts[g.id] ?? 0;
              return (
                <div
                  className={`group-row ${dragId === g.id ? "dragging" : ""}`}
                  key={g.id}
                  data-row
                >
                  <button
                    className="drag-handle"
                    onPointerDown={(e) => onHandleDown(e, g.id)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    onKeyDown={(e) => onHandleKey(e, i)}
                    title="끌어서 순서 변경 (또는 ↑↓ 키)"
                    aria-label={`${g.name} 순서 바꾸기`}
                  >
                    ⠿
                  </button>
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
        </div>

        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
