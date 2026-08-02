import "./globals.css";

// 하위 경로 배포(GitHub Pages)에서도 아이콘·manifest 경로가 맞도록 접두사를 붙인다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "맛집지도",
  description: "우리만의 맛집지도",
  manifest: `${basePath}/manifest.webmanifest`,
};

export const viewport = {
  themeColor: "#1b2430",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="apple-touch-icon" href={`${basePath}/icons/icon-192.png`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&family=Noto+Sans+KR:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
