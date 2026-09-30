import { SEED_MOVIES } from './fixtures';
import { expect, importSeed, mockTmdbImages, shot, test, waitForImages } from './helpers';

test('빈 도감 · 등급 안내 화면', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '아직 모은 카드가 없어요' })).toBeVisible();
  await expect(page.getByRole('link', { name: '첫 티켓 스캔하기' })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '00-empty');

  await page.getByRole('link', { name: '등급' }).click();
  await expect(page.getByRole('heading', { name: '카드 등급 안내' })).toBeVisible();
  for (const name of ['노멀', '레어', '홀로 레어', '울트라 레어', '시크릿 레어', '레전드']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await page.waitForTimeout(600);
  await shot(page, '30-tiers', true);
});

test('설정: 저장 상태 표시, 백업 파일을 저장하면 마지막 백업 날짜가 남는다', async ({ page }) => {
  await page.goto('./#/settings');
  const stats = page.getByTestId('storage-stats');
  await expect(stats).toContainText('영화 0편 · 관람 0회');
  await expect(page.getByTestId('last-backup')).toHaveText('아직 없음');
  await expect(page.getByTestId('persist-state')).toHaveText(/영구 보관|기본 보관/);

  await importSeed(page);
  await expect(stats).toContainText(`영화 ${SEED_MOVIES.length}편 · 관람 29회`);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '백업 파일 저장' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^cinedex-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByTestId('last-backup')).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
  // 새로고침해도 백업 날짜가 유지된다
  await page.reload();
  await expect(page.getByTestId('last-backup')).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
  await page.waitForTimeout(400);
  await shot(page, '42-settings-storage');
});

test('백업으로 채운 도감 + 등급별 카드 상세 화면', async ({ page }) => {
  await mockTmdbImages(page);
  await importSeed(page);

  await page.getByRole('link', { name: '도감' }).click();
  const cards = page.locator('.card-grid .card');
  await expect(cards).toHaveCount(SEED_MOVIES.length);
  await expect(page.locator('.stats')).toContainText(`${SEED_MOVIES.length}편`);
  await expect(page.locator('.stats')).toContainText('29회');
  await expect(page.locator('.stats')).toContainText('레전드');
  // 최근 관람순: 가장 마지막에 등록한 레전드 영화가 맨 앞
  await expect(cards.first()).toHaveAttribute('data-tier', 'legend');
  await waitForImages(page);
  await page.waitForTimeout(800);
  await shot(page, '20-collection', true);

  await page.getByRole('button', { name: '많이 본 순' }).click();
  await expect(cards.nth(0)).toHaveAttribute('data-tier', 'legend');
  await expect(cards.nth(1)).toHaveAttribute('data-tier', 'secret');

  const expected: Record<string, string> = {
    emperor: 'legend',
    prism: 'secret',
    golden: 'ultra',
    deepblue: 'holo',
    redline: 'rare',
    starsong: 'normal',
    mine: 'normal',
  };
  for (const movie of SEED_MOVIES) {
    await page.goto('./#/');
    await page.getByRole('link', { name: new RegExp(`^${movie.title} ·`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: movie.title })).toBeVisible();
    const hero = page.locator('.movie__card .card');
    await expect(hero).toHaveAttribute('data-tier', expected[movie.key]);
    await expect(page.getByRole('heading', { name: `관람 기록 ${movie.count}회` })).toBeVisible();
    await waitForImages(page);
    await page.waitForTimeout(900);
    await shot(page, `2${Object.keys(expected).indexOf(movie.key) + 1}-detail-${expected[movie.key]}-${movie.key}`);
  }
});

test('카드 상세: 3사 정복, 등급별 카드 전환, 잠긴 등급, 마우스로 기울이기', async ({ page }) => {
  await mockTmdbImages(page);
  await importSeed(page);
  await page.goto('./#/');
  await page.getByRole('link', { name: /^골든 아워 ·/ }).click();

  // 5회 관람(울트라) → 시크릿·레전드는 잠김
  await expect(page.getByRole('img', { name: '시크릿 레어 카드 잠김 · 2회 더 보면 해금' })).toBeVisible();
  await expect(page.getByRole('img', { name: '레전드 카드 잠김 · 5회 더 보면 해금' })).toBeVisible();
  await expect(page.getByText('3사 정복까지: 메가박스에서 한 번씩 더')).toBeVisible();
  await expect(page.getByText('시크릿 레어까지 2회')).toBeVisible();

  // 해금된 하위 등급 카드로 전환 → 그 등급의 한정 포스터
  await page.getByRole('button', { name: '홀로 레어 카드 크게 보기' }).click();
  const hero = page.locator('.movie__card .card');
  await expect(hero).toHaveAttribute('data-tier', 'holo');
  await expect(hero.locator('img.card__img')).toHaveAttribute('src', /\/w780\/golden-3\.jpg$/);
  await expect(page.getByText(/^홀로 레어 해금 · /)).toBeVisible();

  // 마우스를 올리면 카드가 기울고 홀로 효과가 포인터를 따라간다
  const box = (await hero.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 4 });
  await expect(hero).toHaveClass(/is-active/);
  const rotate = await hero.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--rotate-x'));
  expect(parseFloat(rotate)).toBeGreaterThan(5);
  await page.waitForTimeout(300);
  await shot(page, '28-detail-tilt');
  await page.mouse.move(5, 5);
  await expect(hero).not.toHaveClass(/is-active/);

  // 레전드 영화는 3사 정복
  await page.goto('./#/');
  await page.getByRole('link', { name: /^엠퍼러: 황금의 왕좌 ·/ }).click();
  await expect(page.getByText('3사 정복! CGV·롯데시네마·메가박스에서 모두 봤어요.')).toBeVisible();
  await expect(page.locator('.movie__card .card')).toHaveAttribute('aria-label', /3사 정복/);
  await expect(page.getByText('최고 등급 달성')).toBeVisible();
});
