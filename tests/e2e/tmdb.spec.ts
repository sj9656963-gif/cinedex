import type { Page, Route } from '@playwright/test';
import { fixturePath } from './fixtures';
import { expect, mockTmdbImages, openReveal, shot, test } from './helpers';

// 잘못된 토큰 확인 단계에서 브라우저가 남기는 401 네트워크 로그는 의도한 것
test.use({ allowedConsoleErrors: [/status of 401/] });

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0LXRva2VuIn0.c2lnbmF0dXJl';

const DUNE = {
  id: 693134,
  title: '듄: 파트 2',
  original_title: 'Dune: Part Two',
  release_date: '2024-02-28',
  poster_path: '/dune-ko-main.jpg',
};
const NOW = { id: 1001, title: '지금 상영작', original_title: 'Now Showing', release_date: '2026-09-17', poster_path: '/now-1.jpg' };

const DUNE_POSTERS = [
  { file_path: '/dune-ko-main.jpg', iso_639_1: 'ko', vote_average: 6, width: 1000, height: 1500 },
  { file_path: '/dune-ko-alt.jpg', iso_639_1: 'ko', vote_average: 5, width: 1000, height: 1500 },
  { file_path: '/dune-en-1.jpg', iso_639_1: 'en', vote_average: 7, width: 1000, height: 1500 },
  { file_path: '/dune-art-4.jpg', iso_639_1: null, vote_average: 8, width: 1000, height: 1500 },
  { file_path: '/dune-art-5.jpg', iso_639_1: null, vote_average: 6, width: 1000, height: 1500 },
  { file_path: '/dune-art-6.jpg', iso_639_1: null, vote_average: 5, width: 1000, height: 1500 },
];

async function mockTmdbApi(page: Page) {
  const calls: string[] = [];
  await page.route('https://api.themoviedb.org/3/**', (route: Route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, accept',
          'access-control-allow-methods': 'GET',
        },
      });
    }
    if (route.request().headers()['authorization'] !== `Bearer ${TOKEN}`) return json({ status_message: 'Invalid API key' }, 401);
    switch (url.pathname) {
      case '/3/configuration':
        return json({ images: { secure_base_url: 'https://image.tmdb.org/t/p/' } });
      case '/3/movie/now_playing':
        return json({ results: [NOW, DUNE] });
      case '/3/search/movie':
        return json({ results: (url.searchParams.get('query') ?? '').includes('듄') ? [DUNE] : [] });
      case `/3/movie/${DUNE.id}/images`:
        return json({ posters: DUNE_POSTERS });
      default:
        return json({ status_message: 'not found' }, 404);
    }
  });
  return calls;
}

test('TMDB 토큰 연결, 영화 검색, 등급마다 다른 공식 포스터가 들어간다', async ({ page }) => {
  const images = await mockTmdbImages(page);
  const calls = await mockTmdbApi(page);

  // 잘못된 토큰은 저장하지 않는다
  await page.goto('./#/settings');
  const tokenInput = page.getByLabel('API 읽기 액세스 토큰 또는 API 키');
  await tokenInput.fill('eyJ.wrong.token');
  await page.getByRole('button', { name: '저장하고 연결 확인' }).click();
  await expect(page.getByText('TMDB 토큰이 올바르지 않아요')).toBeVisible();

  await tokenInput.fill(TOKEN);
  await page.getByRole('button', { name: '저장하고 연결 확인' }).click();
  await expect(page.getByText('TMDB에 연결됐어요')).toBeVisible();
  await shot(page, '40-settings', true);

  // 롯데시네마 QR 스캔 → 현재 상영작 목록 → '듄' 검색
  await page.goto('./#/scan');
  await page.getByTestId('scan-image-input').setInputFiles(fixturePath('ticket-lotte-qr.png'));
  await expect(page.getByRole('radio', { name: '롯데시네마' })).toBeChecked();
  const nowPlaying = page.getByRole('region', { name: '지금 상영 중' });
  await expect(nowPlaying.getByRole('button', { name: /지금 상영작/ })).toBeVisible();
  await page.getByRole('searchbox', { name: '영화 제목' }).fill('듄');
  const result = page.getByRole('region', { name: '검색 결과' }).getByRole('button', { name: /듄: 파트 2/ });
  await expect(result).toBeVisible();
  await expect(result).toContainText('2024 · Dune: Part Two');
  await shot(page, '41-tmdb-search');
  await result.click();
  await page.getByRole('button', { name: '카드 받기' }).click();

  let reveal = await openReveal(page);
  await expect(reveal.locator('.flip__front img.card__img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w500/dune-ko-main.jpg',
  );
  await reveal.getByRole('button', { name: '카드 보기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '듄: 파트 2' })).toBeVisible();
  await expect(page.locator('.topbar').getByText('Dune: Part Two · 2024')).toBeVisible();
  await expect(page.locator('.movie__card img.card__img')).toHaveAttribute('src', /\/w780\/dune-ko-main\.jpg$/);

  // 두 번째 관람: 도감의 영화 선택 → 레어 카드는 다른 포스터
  await page.goto('./#/scan');
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('LOTTE-2ND-000123');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await page.getByRole('region', { name: '내 도감에 있는 영화' }).getByRole('button', { name: /듄: 파트 2/ }).click();
  await page.getByRole('button', { name: '카드 받기' }).click();
  reveal = await openReveal(page);
  await expect(reveal.getByRole('heading', { name: /^레어/ })).toBeVisible();
  await expect(reveal.locator('.flip__front img.card__img')).toHaveAttribute('src', /\/w500\/dune-ko-alt\.jpg$/);

  expect(calls.filter((c) => c.startsWith(`/3/movie/${DUNE.id}/images`))).toHaveLength(1);
  expect(images.some((p) => p.endsWith('/dune-ko-alt.jpg'))).toBe(true);
});
