"use client";

import { useState } from "react";
import { supabase, Entry, Group } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  groups: Group[];
  initial?: Partial<Entry>;
  // 지도 클릭으로 넘어온 좌표 + (가능하면) 주소
  pickedCoord?: { lat: number; lng: number; address?: string } | null;
  onDone: () => void;
  onClose: () => void;
};

export default function EntryForm({ groups, initial, pickedCoord, onDone, onClose }: Props) {
  const { session, profile } = useAuth();
  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || pickedCoord?.address || "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [catchtableUrl, setCatchtableUrl] = useState(initial?.catchtable_url || "");
  const [groupId, setGroupId] = useState(initial?.group_id || groups[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 좌표: 지도 클릭값 > 기존값 순으로 사용. 주소검색 성공 시 아래 state로 덮어씀.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    pickedCoord
      ? { lat: pickedCoord.lat, lng: pickedCoord.lng }
      : initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null
  );

  // 주소 → 좌표 (Naver Geocoding). NCP에서 Geocoding API가 켜져 있고 지도 SDK가
  // 로드된 경우에만 동작. 실패하면 조용히 주소만 저장한다.
  const geocodeAddress = () => {
    const svc = (window as any).naver?.maps?.Service;
    if (!address.trim() || !svc?.geocode) {
      alert("주소 검색은 지도 탭을 한 번 연 뒤 사용할 수 있어요. 좌표는 지도를 탭해 지정할 수도 있습니다.");
      return;
    }
    setGeocoding(true);
    svc.geocode({ query: address.trim() }, (status: any, response: any) => {
      setGeocoding(false);
      if (status !== svc.Status.OK) return;
      const item = response?.v2?.addresses?.[0];
      if (!item) {
        alert("해당 주소의 좌표를 찾지 못했어요. 지도를 직접 탭해 지정해 주세요.");
        return;
      }
      setCoord({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
      const road = item.roadAddress || item.jibunAddress;
      if (road) setAddress(road);
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const base = {
      name: name.trim(),
      address: address.trim() || null,
      memo: memo.trim() || null,
      catchtable_url: catchtableUrl.trim() || null,
      group_id: groupId || null,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      updated_at: new Date().toISOString(),
    };

    // 등록자는 로그인 정보에서 가져온다. 이름은 표시용 스냅샷으로 함께 저장.
    const { error } = initial?.id
      ? await supabase.from("entries").update(base).eq("id", initial.id)
      : await supabase.from("entries").insert({
          ...base,
          created_by: session?.user.id ?? null,
          created_by_name: profile?.display_name ?? null,
        });

    setSaving(false);
    if (error) {
      setError(
        error.message.includes("row-level security")
          ? "저장 권한이 없습니다. 관리자에게 편집자 권한을 요청해 주세요."
          : error.message
      );
      return;
    }
    onDone();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial?.id ? "맛집 수정" : "맛집 등록"}</h3>

        <div className="field">
          <label>이름 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="가게 이름" />
        </div>

        <div className="field">
          <label>주소</label>
          <div className="input-with-btn">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="지도를 탭하거나 주소 입력 후 [좌표 찾기]"
            />
            <button type="button" className="mini-btn" onClick={geocodeAddress} disabled={geocoding}>
              {geocoding ? "검색…" : "좌표 찾기"}
            </button>
          </div>
          {coord && (
            <p className="hint">좌표 저장됨: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</p>
          )}
        </div>

        <div className="field">
          <label>그룹</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>메모</label>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메뉴, 웨이팅 팁, 같이 간 사람 등" />
        </div>

        <div className="field">
          <label>Catchtable 링크</label>
          <input value={catchtableUrl} onChange={(e) => setCatchtableUrl(e.target.value)} placeholder="https://app.catchtable.co.kr/..." />
        </div>

        <p className="hint" style={{ marginBottom: 12 }}>
          즐겨찾기는 사람마다 다릅니다. 저장 후 목록이나 지도에서 ★를 눌러 지정하세요.
        </p>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary" disabled={saving || !name.trim()} onClick={save}>
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="btn-ghost" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}
