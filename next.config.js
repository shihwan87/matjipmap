/** @type {import('next').NextConfig} */

// GitHub Pages는 보통 https://<사용자명>.github.io/<저장소명>/ 처럼
// "하위 경로"로 서비스된다. 그 경우 저장소명을 '/matjipmap' 형태로 넣어야
// 이미지·아이콘 경로가 깨지지 않는다.
// 루트로 서비스되는 경우(Vercel, 또는 <사용자명>.github.io 저장소)는 빈 값으로 둔다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  // 서버 없이 순수 HTML/JS 파일로만 내보낸다 (GitHub Pages 배포에 필요).
  // 이 앱은 모든 동작이 브라우저에서 일어나므로 정적 배포로 충분하다.
  output: "export",
  basePath,
  // 정적 배포에서는 Next의 이미지 최적화 서버를 쓸 수 없다.
  images: { unoptimized: true },
};

module.exports = nextConfig;
