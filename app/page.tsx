"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, Entry, Group } from "@/lib/supabaseClient";
import MapView from "@/components/MapView";
import EntryList from "@/components/EntryList";
import EntryForm from "@/components/EntryForm";

export default function Home() {
  const [tab, setTab] = useState<"map" | "list">("map");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | "all" | "fav">("all");
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [pickedCoord, setPickedCoord] = useState<{ lat: number; lng: number; address?: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: e }, { data: g }] = await Promise.all([
      supabase.from("entries").select("*").order("created_at", { ascending: false }),
      supabase.from("groups").select("*").order("created_at", { ascending: true }),
    ]);
    setEntries(e || []);
    setGroups(g || []);
  }, []);

  useEffect(() => {
    load();
    // 실시간 동기화: 다른 사람이 추가/수정/삭제하면 자동 반영
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const shownEntries = activeGroup === "all" ? entries
    : activeGroup === "fav" ? entries.filter((e) => e.is_favorite)
    : entries.filter((e) => e.group_id === activeGroup);

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">맛집지도</span>
        <div className="tabs">
          <button className={`tab-btn ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>지도</button>
          <button className={`tab-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>목록</button>
        </div>
      </div>

      <div className="main">
        {tab === "map" ? (
          <MapView
            entries={shownEntries}
            onMapClick={(lat, lng, address) => { setPickedCoord({ lat, lng, address }); setEditing(null); }}
            onMarkerClick={(entry) => { setPickedCoord(null); setEditing(entry); }}
          />
        ) : (
          <EntryList
            entries={entries}
            groups={groups}
            activeGroup={activeGroup}
            onFilterChange={setActiveGroup}
            onEdit={(entry) => { setPickedCoord(null); setEditing(entry); }}
            onChanged={load}
          />
        )}
      </div>

      <button className="fab" onClick={() => { setPickedCoord(null); setEditing(null); }}>+</button>

      {editing !== undefined && (
        <EntryForm
          groups={groups}
          initial={editing || undefined}
          pickedCoord={pickedCoord}
          onDone={() => { setEditing(undefined); load(); }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
