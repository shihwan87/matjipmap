"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, Entry, Group, GroupMap, EntryGroup, ROLE_LABEL } from "@/lib/supabaseClient";
import MapView from "@/components/MapView";
import EntryList from "@/components/EntryList";
import EntryForm from "@/components/EntryForm";
import AuthPanel from "@/components/AuthPanel";
import AdminPanel from "@/components/AdminPanel";
import FeedbackPanel from "@/components/FeedbackPanel";
import FeedbackAdmin from "@/components/FeedbackAdmin";
import GroupPanel from "@/components/GroupPanel";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const { session, profile, role, canEdit, isAdmin, ready, signOut } = useAuth();

  const [tab, setTab] = useState<"map" | "list">("map");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  // 맛집 id → 붙어 있는 그룹 id 목록 (한 맛집이 여러 그룹에 속할 수 있다)
  const [groupMap, setGroupMap] = useState<GroupMap>(new Map());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [activeGroup, setActiveGroup] = useState<string | "all" | "fav" | "none">("all");
  const [activeCuisine, setActiveCuisine] = useState<string>("all");
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [pickedCoord, setPickedCoord] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFeedbackAdmin, setShowFeedbackAdmin] = useState(false);
  const [showGroups, setShowGroups] = useState(false);

  // 맛집·그룹은 로그인 여부와 무관하게 누구나 읽을 수 있다.
  const load = useCallback(async () => {
    const [{ data: e }, { data: g }, { data: eg }] = await Promise.all([
      supabase.from("entries").select("*").order("created_at", { ascending: false }),
      // 그룹은 사용자가 지정한 순서(sort_order)를 따른다
      supabase
        .from("groups")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("entry_groups").select("*"),
    ]);
    setEntries(e || []);
    setGroups(g || []);

    const map: GroupMap = new Map();
    ((eg as EntryGroup[]) || []).forEach((row) => {
      const list = map.get(row.entry_id) ?? [];
      list.push(row.group_id);
      map.set(row.entry_id, list);
    });
    setGroupMap(map);
  }, []);

  // 즐겨찾기는 개인별이므로 로그인한 사용자의 것만 가져온다.
  const loadFavorites = useCallback(async () => {
    if (!session) {
      setFavoriteIds(new Set());
      return;
    }
    const { data } = await supabase.from("favorites").select("entry_id");
    setFavoriteIds(new Set((data || []).map((r: { entry_id: string }) => r.entry_id)));
  }, [session]);

  useEffect(() => {
    load();
    // 실시간 동기화: 다른 사람이 추가/수정/삭제하면 자동 반영
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  // 선택해 둔 그룹이 삭제되면 필터가 빈 화면을 가리키게 되므로 전체로 되돌린다.
  useEffect(() => {
    if (activeGroup === "all" || activeGroup === "fav" || activeGroup === "none") return;
    if (!groups.some((g) => g.id === activeGroup)) setActiveGroup("all");
  }, [groups, activeGroup]);

  // 즐겨찾기 토글 — 화면을 먼저 바꾸고 서버에 반영한다(실패 시 되돌림).
  const toggleFavorite = async (entryId: string) => {
    if (!session) { setShowAuth(true); return; }
    const wasFaved = favoriteIds.has(entryId);

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFaved) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

    const { error } = wasFaved
      ? await supabase.from("favorites").delete().eq("entry_id", entryId).eq("user_id", session.user.id)
      : await supabase.from("favorites").insert({ entry_id: entryId, user_id: session.user.id });

    if (error) {
      alert("즐겨찾기 변경에 실패했습니다: " + error.message);
      loadFavorites();
    }
  };

  // 지도에도 목록과 같은 필터를 적용한다 (그룹과 업종은 함께 적용)
  const shownEntries = entries.filter((e) => {
    const ids = groupMap.get(e.id) ?? [];
    if (activeGroup === "fav" && !favoriteIds.has(e.id)) return false;
    if (activeGroup === "none" && ids.length > 0) return false;
    if (activeGroup !== "all" && activeGroup !== "fav" && activeGroup !== "none"
        && !ids.includes(activeGroup)) return false;

    if (activeCuisine === "none" && e.cuisine) return false;
    if (activeCuisine !== "all" && activeCuisine !== "none" && e.cuisine !== activeCuisine) return false;

    return true;
  });

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">맛집지도</span>
        <div className="tabs">
          <button className={`tab-btn ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>지도</button>
          <button className={`tab-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>목록</button>
        </div>
        <div className="account">
          {!ready ? null : session ? (
            <>
              <span className="account-name">
                {profile?.display_name || "사용자"}
                <span className="role-badge">{role !== "anon" ? ROLE_LABEL[role] : ""}</span>
              </span>
              <button className="mini-btn" onClick={() => setShowFeedback(true)}>의견</button>
              {isAdmin && (
                <>
                  <button className="mini-btn" onClick={() => setShowFeedbackAdmin(true)}>받은의견</button>
                  <button className="mini-btn" onClick={() => setShowAdmin(true)}>관리</button>
                </>
              )}
              <button className="mini-btn" onClick={signOut}>로그아웃</button>
            </>
          ) : (
            <button className="mini-btn" onClick={() => setShowAuth(true)}>로그인</button>
          )}
        </div>
      </div>

      {/* 열람자에게는 왜 등록 버튼이 없는지 알려준다 */}
      {ready && session && !canEdit && (
        <p className="banner">보기 전용 계정입니다. 맛집을 등록하려면 관리자에게 편집 권한을 요청하세요.</p>
      )}

      <div className="main">
        {tab === "map" ? (
          <MapView
            entries={shownEntries}
            favoriteIds={favoriteIds}
            onMapClick={canEdit ? (lat, lng, address) => { setPickedCoord({ lat, lng, address }); setEditing(null); } : undefined}
            onMarkerClick={canEdit ? (entry) => { setPickedCoord(null); setEditing(entry); } : undefined}
          />
        ) : (
          <EntryList
            entries={entries}
            groups={groups}
            groupMap={groupMap}
            activeGroup={activeGroup}
            onFilterChange={setActiveGroup}
            activeCuisine={activeCuisine}
            onCuisineChange={setActiveCuisine}
            onEdit={(entry) => { setPickedCoord(null); setEditing(entry); }}
            onChanged={load}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            onRequireLogin={() => setShowAuth(true)}
            onManageGroups={() => setShowGroups(true)}
          />
        )}
      </div>

      {canEdit && (
        <button className="fab" onClick={() => { setPickedCoord(null); setEditing(null); }}>+</button>
      )}

      {editing !== undefined && canEdit && (
        <EntryForm
          groups={groups}
          initial={editing || undefined}
          initialGroupIds={editing ? groupMap.get(editing.id) ?? [] : []}
          pickedCoord={pickedCoord}
          onDone={() => { setEditing(undefined); load(); }}
          onClose={() => setEditing(undefined)}
        />
      )}

      {showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
      {showAdmin && isAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showFeedback && (
        <FeedbackPanel
          screen={tab}
          onClose={() => setShowFeedback(false)}
          onRequireLogin={() => { setShowFeedback(false); setShowAuth(true); }}
        />
      )}
      {showFeedbackAdmin && isAdmin && (
        <FeedbackAdmin onClose={() => setShowFeedbackAdmin(false)} />
      )}
      {showGroups && canEdit && (
        <GroupPanel
          groups={groups}
          groupMap={groupMap}
          onChanged={load}
          onClose={() => setShowGroups(false)}
        />
      )}
    </div>
  );
}
