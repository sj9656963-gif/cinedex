import { fixturePath } from './fixtures';
import { expect, openReveal, shot, test } from './helpers';

test('사진 속 CGV QR 인식, 극장 자동 선택, 직접 입력한 영화로 노멀 카드 획득, 같은 티켓 중복 차단', async ({ page }) => {
  await page.goto('./#/scan');
  await expect(page.getByRole('heading', { name: '티켓 스캔' })).toBeVisible();
  await shot(page, '10-scan');

  await page.getByTestId('scan-image-input').setInputFiles(fixturePath('ticket-cgv-qr.png'));
  await expect(page.getByRole('heading', { name: '관람 정보 확인' })).toBeVisible();
  const pill = page.getByTestId('ticket-pill');
  await expect(pill).toContainText('QR 코드');
  await expect(pill).toContainText('CGV 티켓으로 인식');
  // 원본 티켓 번호는 화면에도 끝자리만
  await expect(pill).not.toContainText('T20260930123456');
  await expect(page.getByRole('radio', { name: 'CGV' })).toBeChecked();

  const submit = page.getByRole('button', { name: '카드 받기' });
  await expect(submit).toBeDisabled();
  await expect(page.getByText('설정에서 TMDB 토큰을 넣으면', { exact: false })).toBeVisible();
  await page.getByRole('searchbox', { name: '영화 제목' }).fill('테스트 무비');
  await page.getByRole('button', { name: '‘테스트 무비’ 제목으로 직접 추가' }).click();
  await expect(page.getByTestId('selected-movie')).toContainText('테스트 무비');
  await shot(page, '11-details');
  await submit.click();

  const reveal = page.getByTestId('reveal');
  await expect(reveal.getByRole('heading', { name: '카드를 탭해서 열어 보세요' })).toBeVisible();
  await shot(page, '12-reveal-back');
  await openReveal(page);
  await expect(reveal.getByRole('heading', { name: /노멀/ })).toBeVisible();
  await expect(reveal).toContainText('새 카드 획득!');
  await expect(reveal).toContainText('레어까지 1회 더!');
  await expect(reveal.getByRole('img', { name: /테스트 무비 · 노멀 카드 · 관람 1회 · No\.0001/ })).toBeVisible();
  await page.waitForTimeout(1600);
  await shot(page, '13-reveal-normal');

  await reveal.getByRole('button', { name: '카드 보기' }).click();
  await expect(page).toHaveURL(/#\/movie\/local%3A/);
  await expect(page.getByRole('heading', { level: 1, name: '테스트 무비' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '관람 기록 1회' })).toBeVisible();
  await expect(page.getByText('레어까지 1회')).toBeVisible();

  // 같은 QR 을 다시 스캔 → 중복
  await page.goto('./#/scan');
  await page.getByTestId('scan-image-input').setInputFiles(fixturePath('ticket-cgv-qr.png'));
  await expect(page.getByRole('heading', { name: '이미 등록된 티켓이에요' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('테스트 무비');
  await shot(page, '14-duplicate');
  await page.getByRole('link', { name: '카드 보러 가기' }).click();
  await expect(page.getByRole('heading', { name: '관람 기록 1회' })).toBeVisible();
});

test('바코드 사진으로 첫 관람, 예매번호 직접 입력으로 두 번째 관람, 레어로 등급 업', async ({ page }) => {
  await page.goto('./#/scan');
  await page.getByTestId('scan-image-input').setInputFiles(fixturePath('ticket-barcode.png'));
  await expect(page.getByTestId('ticket-pill')).toContainText('Code 128');
  await expect(page.getByTestId('ticket-pill')).not.toContainText('티켓으로 인식');

  // 극장을 알 수 없는 코드 → 직접 선택해야 제출 가능
  await page.getByRole('searchbox', { name: '영화 제목' }).fill('두 번 본 영화');
  await page.getByRole('button', { name: '‘두 번 본 영화’ 제목으로 직접 추가' }).click();
  await expect(page.getByText('영화관을 골라 주세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '카드 받기' })).toBeDisabled();
  await page.getByRole('radio', { name: '메가박스' }).check();
  await page.getByRole('button', { name: '카드 받기' }).click();
  let reveal = await openReveal(page);
  await expect(reveal.getByRole('heading', { name: /노멀/ })).toBeVisible();
  await reveal.getByRole('button', { name: '다른 티켓 스캔' }).click();

  // 두 번째 티켓: 예매번호 직접 입력
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('5555-6666-7777');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByTestId('ticket-pill')).toContainText('직접 입력');
  // 지난번에 고른 극장이 기본값
  await expect(page.getByRole('radio', { name: '메가박스' })).toBeChecked();
  await page.getByRole('button', { name: /두 번 본 영화.*1회 관람/ }).click();
  await expect(page.getByTestId('selected-movie')).toContainText('이번이 2회째');
  await page.getByRole('button', { name: '카드 받기' }).click();

  reveal = await openReveal(page);
  await expect(reveal.getByRole('heading', { name: /^레어/ })).toBeVisible();
  await expect(reveal).toContainText('노멀 → 레어 등급 업!');
  await expect(reveal).toContainText('홀로 레어까지 1회 더!');
  await page.waitForTimeout(1600);
  await shot(page, '15-reveal-rare-tierup');
  await reveal.getByRole('button', { name: '카드 보기' }).click();
  await expect(page.getByRole('heading', { name: '관람 기록 2회' })).toBeVisible();
  await expect(page.getByText('레어 해금', { exact: true })).toBeVisible();

  // 하이픈 없이 같은 번호 → 같은 티켓으로 판단
  await page.goto('./#/scan');
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('555566667777');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이미 등록된 티켓이에요' })).toBeVisible();

  // 너무 짧은 번호는 거절
  await page.getByRole('button', { name: '다른 티켓 스캔' }).click();
  await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
  await page.getByLabel('예매번호 · 티켓 번호').fill('123');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByText('티켓 코드가 너무 짧아요')).toBeVisible();
  await expect(page.getByRole('heading', { name: '티켓 스캔' })).toBeVisible();
});

test('관람 기록 삭제 시 등급이 내려가고, 마지막 기록을 지우면 카드가 사라진다', async ({ page }) => {
  for (const code of ['DEL-TICKET-0001', 'DEL-TICKET-0002']) {
    await page.goto('./#/scan');
    await page.getByRole('button', { name: '예매번호 직접 입력' }).click();
    await page.getByLabel('예매번호 · 티켓 번호').fill(code);
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('radio', { name: 'CGV' }).check();
    await page.getByRole('searchbox', { name: '영화 제목' }).fill('지울 영화');
    const mine = page.getByRole('button', { name: /지울 영화.*회 관람/ });
    if (await mine.count()) await mine.click();
    else await page.getByRole('button', { name: '‘지울 영화’ 제목으로 직접 추가' }).click();
    await page.getByRole('button', { name: '카드 받기' }).click();
    await openReveal(page);
    await page.getByRole('button', { name: '카드 보기' }).click();
    // 화면 전환(hashchange)이 처리된 뒤에 다음 티켓으로 넘어간다.
    await expect(page.getByRole('heading', { level: 1, name: '지울 영화' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: '관람 기록 2회' })).toBeVisible();

  await page.getByRole('button', { name: '2번째 관람 기록 삭제' }).click();
  const dialog = page.getByRole('dialog', { name: '2번째 관람 기록을 삭제할까요?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '삭제' }).click();
  await expect(page.getByRole('heading', { name: '관람 기록 1회' })).toBeVisible();
  await expect(page.getByRole('img', { name: /지울 영화 · 노멀 카드/ }).first()).toBeVisible();

  await page.getByRole('button', { name: '1번째 관람 기록 삭제' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: '아직 모은 카드가 없어요' })).toBeVisible();
});
