import type { MetadataRoute } from "next";

// PWA(홈 화면 설치) 설정.
// 하위 경로 배포(GitHub Pages)에서도 아이콘 경로가 맞도록 basePath를 붙여 생성한다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "맛집지도",
    short_name: "맛집지도",
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1b2430",
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${basePath}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
