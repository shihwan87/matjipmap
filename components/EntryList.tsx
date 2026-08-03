"use client";

import { useMemo, useState } from "react";
import { Entry, Group, supabase, CUISINES } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  entries: Entry[];
  groups: Group[];
  /** "all" 전체 · "fav" 내 즐겨찾기 · "none" 그룹 미분류 · 그 외는 그룹 id */
  activeGroup: string | "all" | "fav" | "none";
  onFilterChange: (v: string | "all" | "fav" | "none") => void;
  /** "all" 또는 업종명 */
  activeCuisine: string;
  onCuisineChange: (v: string) => void;
  onEdit: (entry: Entry) => void;
  onChanged: () => void;
  /** 내가 즐겨찾기한 entry id 모음 */
  favoriteIds: Set<string>;
  onToggleFavorite: (entryId: string) => void;
  /** 로그인 안 한 사용자가 ★를 눌렀을 때 로그인 창을 띄우기 위한 콜백 */
  onRequireLogin: () => void;
  /** 그룹 관리 화면 열기 (편집 권한이 있을 때만 노출) */
  onManageGroups: () => void;
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
  activeCuisine,
  onCuisineChange,
  onEdit,
  onChanged,
  favoriteIds,
  onToggleFavorite,
  onRequireLogin,
  onManageGroups,
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
      // 1) 그룹 · 즐겨찾기 (즐겨찾기는 "내" 즐겨찾기 기준)
      if (activeGroup === "fav" && !favoriteIds.has(e.id)) return false;
      if (activeGroup === "none" && e.group_id) return false;
      if (activeGroup !== "all" && activeGroup !== "fav" && activeGroup !== "none"
          && e.group_id !== activeGroup) return false;

      // 2) 업종 — 두 필터는 함께(AND) 적용된다
      if (activeCuisine === "none" && e.cuisine) return false;
      if (activeCuisine !== "all" && activeCuisine !== "none" && e.cuisine !== activeCuisine) return false;

      // 3) 검색어 (이름/주소/메모)
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
  }, [entries, activeGroup, activeCuisine, query, sort, favoriteIds]);

  // 업종 칩에 개수를 함께 보여주면 어디에 뭐가 있는지 한눈에 들어온다.
  const cuisineCounts = useMemo(() => {
    const map: Record<string, number> = {};
    entries.forEach((e) => {
      const key = e.cuisine || "none";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [entries]);

  return (
    <div className="list-wrap">
      <div className="filter-block">
        <span className="filter-label">그룹</span>
        <div className="filter-row">
          <button className={`chip ${activeGroup === "all" ? "active" : ""}`} onClick={() => onFilterChange("all")}>전체</button>
          <button className={`chip ${activeGroup === "fav" ? "active" : ""}`} onClick={() => onFilterChange("fav")}>내 즐겨찾기</button>
          {groups.map((g) => (
            <button key={g.id} className={`chip ${activeGroup === g.id ? "active" : ""}`} onClick={() => onFilterChange(g.id)}>
              {g.name}
            </button>
          ))}
          <button className={`chip ${activeGroup === "none" ? "active" : ""}`} onClick={() => onFilterChange("none")}>미분류</button>
        </div>
      </div>

      <div className="filter-block">
        <span className="filter-label">업종</span>
        <div className="filter-row">
          <button className={`chip ${activeCuisine === "all" ? "active" : ""}`} onClick={() => onCuisineChange("all")}>전체</button>
          {CUISINES.map((c) => (
            <button
              key={c}
              className={`chip ${activeCuisine === c ? "active" : ""}`}
              onClick={() => onCuisineChange(c)}
            >
              {c}{cuisineCounts[c] ? ` ${cuisineCounts[c]}` : ""}
            </button>
          ))}
          <button className={`chip ${activeCuisine === "none" ? "active" : ""}`} onClick={() => onCuisineChange("none")}>
            미분류{cuisineCounts["none"] ? ` ${cuisineCounts["none"]}` : ""}
          </button>
        </div>
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
        {canEdit && (
          <button className="mini-btn" onClick={onManageGroups} title="그룹 추가·이름변경·삭제">
            그룹
          </button>
        )}
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
                {entry.cuisine && <span className="tag cuisine">{entry.cuisine}</span>}
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
