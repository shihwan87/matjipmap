"use client";

import { useMemo, useState } from "react";
import { Entry, Group, supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  entries: Entry[];
  groups: Group[];
  activeGroup: string | "all" | "fav";
  onFilterChange: (v: string | "all" | "fav") => void;
  onEdit: (entry: Entry) => void;
  onChanged: () => void;
  /** 내가 즐겨찾기한 entry id 모음 */
  favoriteIds: Set<string>;
  onToggleFavorite: (entryId: string) => void;
  /** 로그인 안 한 사용자가 ★를 눌렀을 때 로그인 창을 띄우기 위한 콜백 */
  onRequireLogin: () => void;
};

type SortKey = "recent" | "name" | "fav";

// 이름으로 네이버지도 검색 링크 (길찾기·상세는 네이버지도 앱/웹에서 이어짐)
const naverMapLink = (entry: Entry) =>
  `https://map.naver.com/p/search/${encodeURIComponent(entry.name + (entry.address ? " " + entry.address : ""))}`;

export default function EntryList({
  entries,
  groups,
  activeGroup,
  onFilterChange,
  onEdit,
  onChanged,
  favoriteIds,
  onToggleFavorite,
  onRequireLogin,
}: Props) {
  const { session, canEdit } = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!confirm("삭제할까요?")) return;
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) {
      setError(
        error.message.includes("row-level security")
          ? "삭제 권한이 없습니다. 관리자에게 문의해 주세요."
          : error.message
      );
      return;
    }
    setError(null);
    onChanged();
  };

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      // 그룹/즐겨찾기 필터 — 즐겨찾기는 "내" 즐겨찾기 기준
      if (activeGroup === "fav" && !favoriteIds.has(e.id)) return false;
      if (activeGroup !== "all" && activeGroup !== "fav" && e.group_id !== activeGroup) return false;
      // 검색어 필터 (이름/주소/메모)
      if (!q) return true;
      return [e.name, e.address, e.memo].some((f) => (f || "").toLowerCase().includes(q));
    });

    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (sort === "fav") {
      sorted.sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)));
    }
    // "recent"는 부모에서 이미 created_at 내림차순으로 넘어오므로 그대로 사용
    return sorted;
  }, [entries, activeGroup, query, sort, favoriteIds]);

  return (
    <div className="list-wrap">
      <div className="filter-row">
        <button className={`chip ${activeGroup === "all" ? "active" : ""}`} onClick={() => onFilterChange("all")}>전체</button>
        <button className={`chip ${activeGroup === "fav" ? "active" : ""}`} onClick={() => onFilterChange("fav")}>내 즐겨찾기</button>
        {groups.map((g) => (
          <button key={g.id} className={`chip ${activeGroup === g.id ? "active" : ""}`} onClick={() => onFilterChange(g.id)}>
            {g.name}
          </button>
        ))}
      </div>

      <div className="list-tools">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·주소·메모 검색"
        />
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recent">최신순</option>
          <option value="name">이름순</option>
          <option value="fav">즐겨찾기순</option>
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {visible.length === 0 && (
        <p className="hint">
          {query
            ? "검색 결과가 없습니다."
            : activeGroup === "fav" && !session
            ? "로그인하면 나만의 즐겨찾기를 만들 수 있어요."
            : "등록된 맛집이 없습니다."}
        </p>
      )}

      {visible.map((entry) => {
        const faved = favoriteIds.has(entry.id);
        return (
          <div className="entry-card" key={entry.id}>
            <button
              className={`fav-btn ${faved ? "on" : ""}`}
              title={faved ? "내 즐겨찾기에서 빼기" : "내 즐겨찾기에 넣기"}
              aria-label={faved ? "내 즐겨찾기에서 빼기" : "내 즐겨찾기에 넣기"}
              onClick={() => (session ? onToggleFavorite(entry.id) : onRequireLogin())}
            >
              {faved ? "★" : "☆"}
            </button>

            <div className="entry-main">
              <p className="entry-name">{entry.name}</p>
              {entry.address && <p className="entry-addr">{entry.address}</p>}
              {entry.memo && <p className="entry-memo">{entry.memo}</p>}
              <div className="entry-tags">
                {/* 좌표가 없으면 지도에 찍히지 않는다. 이유를 눈에 보이게 알려준다. */}
                {(entry.lat == null || entry.lng == null) && (
                  <span className="tag warn">지도 표시 안 됨 · 좌표 없음</span>
                )}
                {groupName(entry.group_id) && <span className="tag">{groupName(entry.group_id)}</span>}
                {entry.created_by_name && <span className="tag">등록: {entry.created_by_name}</span>}
                <a className="tag" href={naverMapLink(entry)} target="_blank" rel="noreferrer">네이버지도</a>
                {entry.catchtable_url && (
                  <a className="tag" href={entry.catchtable_url} target="_blank" rel="noreferrer">Catchtable</a>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="entry-actions">
                <button className="icon-btn" onClick={() => onEdit(entry)}>✎</button>
                <button className="icon-btn" onClick={() => remove(entry.id)}>✕</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
