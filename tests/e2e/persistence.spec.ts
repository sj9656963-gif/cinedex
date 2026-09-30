import { chromium, expect, test } from '@playwright/test';

type Seen = { records: string[]; emptyCollection: boolean };

/**
 * 페이지가 열린 순간부터 화면에 한 번이라도 나타난 '저장된 기록' 문구와 빈 도감 안내를 모두 기록한다.
 * 저장소를 읽는 동안 잠깐이라도 '영화 0편'이나 '아직 모은 카드가 없어요'가 비치면 사용자는 기록이 날아간 줄 안다.
 */
function recordWhatUserSees() {
  const seen: Seen = { records: [], emptyCollection: false };
  (window as unknown as { __seen: Seen }).__seen = seen;
  new MutationObserver(() => {
    const text = document.querySelector('[data-testid="stored-records"]')?.textContent;
    if (text && seen.records.at(-1) !== text) seen.records.push(text);
    if (document.body?.textContent?.includes('아직 모은 카드가 없어요')) seen.emptyCollection = true;
  }).observe(document, { childList: true, subtree: true, characterData: true });
}

// 같은 크롬 프로필로 브라우저를 완전히 종료했다가 다시 실행 → 휴대폰에서 앱을 닫았다 다시 여는 것과 같은 상황
test('브라우저를 완전히 닫았다 다시 열어도 카드와 관람 기록이 남아 있다', async ({ baseURL }, testInfo) => {
  const profile = testInfo.outputPath('chrome-profile');
  const url = (hash: string) => new URL(`./${hash}`, baseURL).href;
  const open = async () => {
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      viewport: { width: 412, height: 915 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    return { context, page, errors };
  };

  // 1) 티켓 등록 → 카드 획득 후 브라우저 종료
  let { context, page, errors } = await open();
  await page.goto(url('#/scan'));
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('KEEP-TICKET-0001');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await page.getByRole('radio', { name: 'CGV' }).check();
  await page.getByRole('searchbox', { name: '영화 제목' }).fill('남아있는 영화');
  await page.getByRole('button', { name: '‘남아있는 영화’ 제목으로 직접 추가' }).click();
  await page.getByRole('button', { name: '카드 받기' }).click();
  await expect(page.getByTestId('reveal')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();

  // 2) 새로 실행: 도감·설정에 그대로 남아 있고, 같은 티켓은 여전히 중복으로 막힌다
  ({ context, page, errors } = await open());
  await page.addInitScript(recordWhatUserSees);
  await page.goto(url(''));
  await expect(page.getByRole('link', { name: /^남아있는 영화 · 노멀 · 1회 관람/ })).toBeVisible();

  await page.goto(url('#/settings'));
  await expect(page.getByTestId('stored-records')).toHaveText('영화 1편 · 관람 1회');
  await expect(page.getByTestId('persist-state')).toHaveText(/영구 보관|기본 보관/);

  // 불러오는 동안에는 '확인 중…'만 보이고, 잘못된 숫자나 빈 도감은 한 번도 나타나지 않았다
  const seen = await page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);
  expect(seen.emptyCollection).toBe(false);
  expect(seen.records).toEqual(['확인 중…', '영화 1편 · 관람 1회']);

  await page.goto(url('#/scan'));
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('KEEP-TICKET-0001');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이미 등록된 티켓이에요' })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('저장소를 읽지 못하면 0편 대신 불러오지 못했다고 알려준다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 브라우저가 사이트 데이터 저장을 막아 IndexedDB 를 열 수 없는 상황
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('IndexedDB blocked (test)', 'SecurityError');
    };
  });
  await page.goto('./#/settings');
  await expect(page.getByTestId('stored-records')).toHaveText('불러오지 못했어요');
  expect(errors).toEqual([]);
});
