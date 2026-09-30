import { test as base, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { posterSvg, seedBackup } from './fixtures';

// Playwright 는 실행할 때마다 test-results 를 비우므로 화면 캡처는 따로 둔다.
export const SHOT_DIR = path.resolve(import.meta.dirname, '../../screenshots');

/** 모든 테스트: 콘솔 에러·페이지 에러(CSP 위반 포함)가 하나라도 있으면 실패. 의도한 에러만 allowedConsoleErrors 로 허용 */
export const test = base.extend<{ consoleErrors: string[]; allowedConsoleErrors: RegExp[] }>({
  allowedConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !allowedConsoleErrors.some((re) => re.test(msg.text()))) errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use(errors);
      expect(errors, '브라우저 콘솔 에러').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** image.tmdb.org 포스터 요청을 가짜 SVG 포스터로 응답 (CORS 헤더 포함) */
export async function mockTmdbImages(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route('https://image.tmdb.org/t/p/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url.pathname);
    const file = url.pathname.split('/').pop() ?? 'poster.jpg';
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: posterSvg(file),
    });
  });
  return requested;
}

export async function importSeed(page: Page, backup: unknown = seedBackup()): Promise<void> {
  await page.goto('./#/settings');
  await page.getByTestId('backup-input').setInputFiles({
    name: 'cinedex-seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText(/불러오기 완료/)).toBeVisible();
}

export async function waitForImages(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
  );
}

export async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage, animations: 'allow' });
}

/** 획득 연출에서 카드를 열고(자동으로 열렸으면 그대로) 결과 화면을 기다린다. */
export async function openReveal(page: Page) {
  const reveal = page.getByTestId('reveal');
  await expect(reveal).toBeVisible();
  const back = reveal.getByRole('button', { name: '카드 열기' });
  if (await back.isEnabled()) await back.click({ timeout: 2_000 }).catch(() => undefined);
  await expect(reveal.getByRole('button', { name: '카드 보기' })).toBeVisible();
  return reveal;
}
