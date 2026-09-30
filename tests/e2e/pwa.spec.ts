import { fixturePath } from './fixtures';
import { expect, test } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('PWA: 매니페스트·서비스 워커 등록, 오프라인에서도 앱과 QR 인식이 동작', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '아직 모은 카드가 없어요' })).toBeVisible();

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ short_name: '씨네덱스', display: 'standalone', lang: 'ko' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);

  // 하위 경로 배포(GitHub Pages)에서도 설치 범위·시작 주소가 앱 위치와 같아야 한다.
  const base = new URL(page.url()).pathname;
  expect(manifest).toMatchObject({ id: base, start_url: base, scope: base });
  const icon = await page.evaluate(async (src) => (await fetch(src)).status, manifest.icons[0].src);
  expect(icon).toBe(200);

  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === 'activated';
  });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
  expect(scope).toBe(new URL(base, page.url()).href);

  // QR 인식용 wasm 까지 미리 캐시됐는지
  const precachedWasm = await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      if ((await cache.keys()).some((r) => r.url.includes('zxing_reader') && r.url.endsWith('.wasm'))) return true;
    }
    return false;
  });
  expect(precachedWasm).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '아직 모은 카드가 없어요' })).toBeVisible();

  await page.getByRole('link', { name: '스캔', exact: true }).click();
  await page.getByTestId('scan-image-input').setInputFiles(fixturePath('ticket-cgv-qr.png'));
  await expect(page.getByRole('heading', { name: '관람 정보 확인' })).toBeVisible();
  await expect(page.getByTestId('ticket-pill')).toContainText('CGV 티켓으로 인식');
  await context.setOffline(false);
});
