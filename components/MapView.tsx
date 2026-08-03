"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry } from "@/lib/supabaseClient";

declare global {
  interface Window {
    naver: any;
  }
}

type Props = {
  entries: Entry[];
  // address는 역지오코딩이 가능할 때만 채워짐 (선택)
  onMapClick?: (lat: number, lng: number, address?: string) => void;
  onMarkerClick?: (entry: Entry) => void;
  center?: { lat: number; lng: number };
  /** 내가 즐겨찾기한 entry id 모음 — 마커 색을 개인별로 다르게 표시한다 */
  favoriteIds: Set<string>;
};

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

export default function MapView({ entries, onMapClick, onMarkerClick, center, favoriteIds }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const markers = useRef<any[]>([]);
  // 지도 객체가 준비되면 true. 마커 이펙트가 지도 로드 완료를 기다리도록 하는 신호.
  const [ready, setReady] = useState(false);

  // 지도는 한 번만 초기화되므로, 그때 등록한 클릭 핸들러는 "첫 렌더 시점의 props"를
  // 계속 붙들게 된다. 첫 렌더에는 아직 로그인 확인 전이라 편집 권한이 없어
  // 콜백이 undefined이고, 이후 관리자로 로그인해도 클릭이 무시된다.
  // 최신 콜백을 ref에 담아 핸들러가 항상 현재 값을 읽도록 한다.
  const onMapClickRef = useRef(onMapClick);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

  // 네이버지도 스크립트 로드 + 지도 초기화
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    if (!clientId) return;

    const init = () => {
      if (!mapRef.current || mapObj.current) return;
      const c = center || DEFAULT_CENTER;
      mapObj.current = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(c.lat, c.lng),
        zoom: 14,
      });
      window.naver.maps.Event.addListener(mapObj.current, "click", (e: any) => {
        const handler = onMapClickRef.current;
        if (!handler) return; // 편집 권한이 없으면 무시
        const lat = e.coord.lat();
        const lng = e.coord.lng();
        // 역지오코딩(좌표 → 주소)은 NCP에서 Reverse Geocoding API가 켜져 있을 때만 동작.
        // 없으면 조용히 좌표만 전달한다.
        if (window.naver.maps.Service?.reverseGeocode) {
          window.naver.maps.Service.reverseGeocode(
            {
              coords: new window.naver.maps.LatLng(lat, lng),
              orders: [
                window.naver.maps.Service.OrderType.ROAD_ADDR,
                window.naver.maps.Service.OrderType.ADDR,
              ].join(","),
            },
            (status: any, response: any) => {
              let address: string | undefined;
              if (status === window.naver.maps.Service.Status.OK) {
                const a = response?.v2?.address;
                address = a?.roadAddress || a?.jibunAddress || undefined;
              }
              handler(lat, lng, address);
            }
          );
        } else {
          handler(lat, lng);
        }
      });
      setReady(true);
    };

    const existing = document.getElementById("naver-map-sdk") as HTMLScriptElement | null;
    if (existing) {
      if (window.naver?.maps) init();
      else existing.addEventListener("load", init);
      return;
    }

    const script = document.createElement("script");
    script.id = "naver-map-sdk";
    // submodules=geocoder: 주소↔좌표 변환 기능. NCP에서 해당 API 미사용이어도 지도는 정상 동작.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마커 렌더링 — 지도가 준비된 뒤(ready) 또는 entries가 바뀔 때마다 다시 그린다.
  useEffect(() => {
    if (!ready || !mapObj.current || !window.naver) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];

    entries.forEach((entry) => {
      if (entry.lat == null || entry.lng == null) return;
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(entry.lat, entry.lng),
        map: mapObj.current,
        title: entry.name,
        icon: favoriteIds.has(entry.id)
          ? {
              content: `<div style="background:#c1440e;color:#fff;border-radius:50%;width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 1px #c1440e"></div>`,
              anchor: new window.naver.maps.Point(7, 7),
            }
          : undefined,
      });
      window.naver.maps.Event.addListener(marker, "click", () => {
        onMarkerClickRef.current?.(entry);
      });
      markers.current.push(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ready, favoriteIds]);

  // "내 위치" — 브라우저 위치 권한으로 지도 중심 이동
  const goToMyLocation = () => {
    if (!mapObj.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapObj.current.setCenter(new window.naver.maps.LatLng(latitude, longitude));
        mapObj.current.setZoom(15);
      },
      () => alert("위치 권한을 허용하면 현재 위치로 이동합니다."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const hasKey = !!process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

  if (!hasKey) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#857e6f" }}>
        네이버지도 API 키가 설정되지 않았습니다.<br />
        .env.local에 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID 값을 넣어주세요.
        (Naver Cloud Platform &gt; AI·NAVER API &gt; Application 등록 후 발급)
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={mapRef} className="map-el" />
      <button className="map-loc-btn" onClick={goToMyLocation} title="내 위치로 이동" aria-label="내 위치로 이동">
        ◎
      </button>
    </div>
  );
}
