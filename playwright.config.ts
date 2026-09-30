import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { normalizeBase } from './vite.config';

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'tests/e2e/.tmp');
const PORT = 4173;
// BASE_PATH=/cinedex/ 로 실행하면 GitHub Pages 처럼 하위 경로에 배포된 상태를 테스트한다.
const BASE = normalizeBase(process.env.BASE_PATH);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    // 테스트에서는 './#/scan' 처럼 상대 경로로 이동하므로 끝에 / 가 있어야 한다.
    baseURL: `${ORIGIN}${BASE}`,
    channel: 'chrome',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        // 가짜 카메라: QR 코드가 찍힌 영상(y4m)을 웹캠처럼 보여준다. 권한은 테스트별로 준다.
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${path.join(FIXTURE_DIR, 'camera-megabox-qr.y4m')}`,
      ],
    },
  },
  webServer: {
    // 실제 배포물(CSP·서비스 워커 포함)로 테스트한다.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `${ORIGIN}${BASE}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
