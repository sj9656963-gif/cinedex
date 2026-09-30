import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * 배포 빌드에만 CSP(meta)를 넣는다. (개발 서버는 HMR용 인라인 스크립트가 필요해서 제외)
 * - wasm-unsafe-eval: QR/바코드 인식용 zxing WebAssembly 실행
 * - TMDB: 영화 검색 API + 포스터 이미지
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.tmdb.org",
    "connect-src 'self' https://api.themoviedb.org",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'cinedex:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
    ],
  };
}

/**
 * 배포 경로. GitHub Pages 프로젝트 사이트(https://아이디.github.io/저장소/)는 하위 경로에서 열리므로
 * 빌드할 때 BASE_PATH=/저장소/ 를 넘긴다. (GitHub Actions 워크플로가 자동으로 넣어 줌)
 * 비어 있으면 도메인 루트('/')에 배포하는 것으로 본다.
 */
export function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

// `--mode phone`: 같은 와이파이의 휴대폰에서 접속할 수 있도록 LAN에 열고 HTTPS(자체 서명)를 켠다.
// 휴대폰 브라우저의 카메라(getUserMedia)는 HTTPS에서만 동작하기 때문.
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone';
  const base = normalizeBase(process.env.BASE_PATH);
  return {
    base,
    plugins: [
      react(),
      phone && basicSsl({ name: 'cinedex-dev' }),
      contentSecurityPolicy(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: base,
          name: '씨네덱스 - 영화 티켓 카드 컬렉션',
          short_name: '씨네덱스',
          description: '영화 티켓 QR·바코드를 스캔하고, 볼수록 화려해지는 영화 포스터 카드를 모아보세요.',
          lang: 'ko',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#0a0b14',
          background_color: '#0a0b14',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // zxing_reader.wasm(약 1.1MB)까지 미리 캐시해서 오프라인에서도 스캔 가능
          globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // 한 번 본 포스터는 오프라인에서도 보이도록 캐시 (image.tmdb.org는 CORS 허용)
              urlPattern: /^https:\/\/image\.tmdb\.org\/t\/p\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-posters',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: { host: phone ? true : undefined },
    preview: { host: phone ? true : undefined },
  };
});
