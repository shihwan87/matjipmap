"use client";

import { useMemo, useState } from "react";
import { Entry, Group, supabase } from "@/lib/supabaseClient";

type Props = {
  entries: Entry[];
  groups: Group[];
  activeGroup: string | "all" | "fav";
  onFilterChange: (v: string | "all" | "fav") => void;
  onEdit: (entry: Entry) => void;
  onChanged: () => void;
};

type SortKey = "recent" | "name" | "fav";

// 이름으로 네이버지도 검색 링크 (길찾기·상세는 네이버지도 앱/웹에서 이어짐)
const naverMapLink = (entry: Entry) =>
  `https://map.naver.com/p/search/${encodeURIComponent(entry.name + (entry.address ? " " + entry.address : ""))}`;

export default function EntryList({ entries, groups, activeGroup, onFilterChange, onEdit, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const remove = async (id: string) => {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("entries").delete().eq("id", id);
    onChanged();
  };

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      // 그룹/즐겨찾기 필터
      if (activeGroup === "fav" && !e.is_favorite) return false;
      if (activeGroup !== "all" && activeGroup !== "fav" && e.group_id !== activeGroup) return false;
      // 검색어 필터 (이름/주소/메모)
      if (!q) return true;
      return [e.name, e.address, e.memo].some((f) => (f || "").toLowerCase().includes(q));
    });

    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (sort === "fav") {
      sorted.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite));
    }
    // "recent"는 부모에서 이미 created_at 내림차순으로 넘어오므로 그대로 사용
    return sorted;
  }, [entries, activeGroup, query, sort]);

  return (
    <div className="list-wrap">
      <div className="filter-row">
        <button className={`chip ${activeGroup === "all" ? "active" : ""}`} onClick={() => onFilterChange("all")}>전체</button>
        <button className={`chip ${activeGroup === "fav" ? "active" : ""}`} onClick={() => onFilterChange("fav")}>즐겨찾기</button>
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

      {visible.length === 0 && <p className="hint">{query ? "검색 결과가 없습니다." : "등록된 맛집이 없습니다."}</p>}

      {visible.map((entry) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-main">
            <p className="entry-name">{entry.name}</p>
            {entry.address && <p className="entry-addr">{entry.address}</p>}
            {entry.memo && <p className="entry-memo">{entry.memo}</p>}
            <div className="entry-tags">
              {entry.is_favorite && <span className="tag fav">즐겨찾기</span>}
              {groupName(entry.group_id) && <span className="tag">{groupName(entry.group_id)}</span>}
              {entry.created_by && <span className="tag">등록: {entry.created_by}</span>}
              <a className="tag" href={naverMapLink(entry)} target="_blank" rel="noreferrer">네이버지도</a>
              {entry.catchtable_url && (
                <a className="tag" href={entry.catchtable_url} target="_blank" rel="noreferrer">Catchtable</a>
              )}
            </div>
          </div>
          <div className="entry-actions">
            <button className="icon-btn" onClick={() => onEdit(entry)}>✎</button>
            <button className="icon-btn" onClick={() => remove(entry.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
