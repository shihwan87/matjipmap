"use client";

import { useState } from "react";
import { supabase, Entry, Group, CUISINES, guessCuisine } from "@/lib/supabaseClient";
import { useAuth } from "./AuthProvider";

type Props = {
  groups: Group[];
  initial?: Partial<Entry>;
  // 지도 클릭으로 넘어온 좌표 + (가능하면) 주소
  pickedCoord?: { lat: number; lng: number; address?: string } | null;
  onDone: () => void;
  onClose: () => void;
};

/** search-place 중계 함수가 돌려주는 검색 결과 한 건 */
type PlaceHit = {
  name: string;
  address: string;
  jibunAddress: string;
  category: string;
  telephone: string;
  lat: number | null;
  lng: number | null;
};

export default function EntryForm({ groups, initial, pickedCoord, onDone, onClose }: Props) {
  const { session, profile } = useAuth();
  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || pickedCoord?.address || "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [catchtableUrl, setCatchtableUrl] = useState(initial?.catchtable_url || "");
  const [groupId, setGroupId] = useState(initial?.group_id || groups[0]?.id || "");
  // 업종. 검색으로 등록하면 자동으로 채워지고, 직접 고를 수도 있다.
  const [cuisine, setCuisine] = useState(initial?.cuisine || "");
  // 네이버가 준 원본 분류 (예: "음식점>한식>냉면"). 표시·보관용.
  const [categoryRaw, setCategoryRaw] = useState(initial?.category_raw || "");
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 가게 이름 검색 상태
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 좌표: 지도 클릭값 > 기존값 순으로 사용. 주소검색·장소검색 성공 시 덮어씀.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    pickedCoord
      ? { lat: pickedCoord.lat, lng: pickedCoord.lng }
      : initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null
  );

  /**
   * 주소 문자열 → 좌표 (Naver Geocoding).
   * NCP에서 Geocoding API가 켜져 있고 지도 SDK가 로드된 경우에만 동작한다.
   * 호출 가능하면 true를 반환한다.
   */
  const geocodeText = (text: string, opts?: { alertOnFail?: boolean }): boolean => {
    const svc = (window as any).naver?.maps?.Service;
    if (!text.trim() || !svc?.geocode) return false;

    setGeocoding(true);
    svc.geocode({ query: text.trim() }, (status: any, response: any) => {
      setGeocoding(false);
      if (status !== svc.Status.OK) return;
      const item = response?.v2?.addresses?.[0];
      if (!item) {
        if (opts?.alertOnFail) {
          alert("해당 주소의 좌표를 찾지 못했어요. 지도를 직접 탭해 지정해 주세요.");
        }
        return;
      }
      setCoord({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
      const road = item.roadAddress || item.jibunAddress;
      if (road) setAddress(road);
    });
    return true;
  };

  const geocodeAddress = () => {
    const ok = geocodeText(address, { alertOnFail: true });
    if (!ok) {
      alert("주소 검색은 지도 탭을 한 번 연 뒤 사용할 수 있어요. 좌표는 지도를 탭해 지정할 수도 있습니다.");
    }
  };

  /** 가게 이름으로 검색 — Supabase 중계 함수를 거쳐 네이버 지역검색을 부른다. */
  const searchPlaces = async () => {
    const q = placeQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setPlaces(null);

    const { data, error } = await supabase.functions.invoke("search-place", {
      body: { query: q },
    });
    setSearching(false);

    if (error) {
      // 함수가 아직 배포되지 않았거나 권한/네트워크 문제
      let message = "검색에 실패했습니다.";
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // 응답 본문을 읽을 수 없으면 기본 메시지 유지
      }
      setSearchError(message);
      return;
    }
    if (data?.error) {
      setSearchError(data.error);
      return;
    }
    setPlaces(data?.places ?? []);
  };

  /** 검색 결과를 폼에 채워 넣는다. */
  const pickPlace = (p: PlaceHit) => {
    setName(p.name);
    const addr = p.address || p.jibunAddress;
    setAddress(addr);

    // 네이버 분류에서 업종을 추정해 미리 채워준다. 사용자가 바꿀 수 있다.
    setCategoryRaw(p.category || "");
    const guessed = guessCuisine(p.category);
    if (guessed) setCuisine(guessed);

    if (p.lat != null && p.lng != null) {
      setCoord({ lat: p.lat, lng: p.lng });
    } else {
      // 검색 결과의 좌표 형식을 알 수 없는 경우 주소로 보정한다.
      geocodeText(addr);
    }
    setPlaces(null);
    setPlaceQuery("");
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
      cuisine: cuisine || null,
      category_raw: categoryRaw.trim() || null,
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

        {/* 가게 이름으로 찾아 한 번에 채우기 */}
        <div className="field">
          <label>가게 이름으로 검색</label>
          <div className="input-with-btn">
            <input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchPlaces();
                }
              }}
              placeholder="예: 성수동 밀도, 광화문 미진"
            />
            <button type="button" className="mini-btn" onClick={searchPlaces} disabled={searching}>
              {searching ? "검색…" : "검색"}
            </button>
          </div>
          {searchError && <p className="form-error" style={{ marginTop: 6 }}>{searchError}</p>}
          {places && places.length === 0 && <p className="hint">검색 결과가 없습니다.</p>}
          {places && places.length > 0 && (
            <ul className="place-results">
              {places.map((p, i) => (
                <li key={i}>
                  <button type="button" className="place-hit" onClick={() => pickPlace(p)}>
                    <span className="place-name">{p.name}</span>
                    <span className="place-addr">{p.address || p.jibunAddress}</span>
                    {p.category && <span className="place-cat">{p.category}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <hr className="divider" />

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

        <div className="row-2">
          <div className="field">
            <label>그룹</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">미분류</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>업종</label>
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
              <option value="">미분류</option>
              {CUISINES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {categoryRaw && <p className="hint">네이버 분류: {categoryRaw}</p>}
          </div>
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
