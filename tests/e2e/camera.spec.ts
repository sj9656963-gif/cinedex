import { expect, test } from './helpers';

test.use({ permissions: ['camera'] });

test('가짜 카메라 영상 속 메가박스 QR 을 실시간으로 자동 인식', async ({ page }) => {
  await page.goto('./#/scan');
  await expect(page.getByRole('heading', { name: '관람 정보 확인' })).toBeVisible({ timeout: 20_000 });
  const pill = page.getByTestId('ticket-pill');
  await expect(pill).toContainText('QR 코드');
  await expect(pill).toContainText('메가박스 티켓으로 인식');
  await expect(page.getByRole('radio', { name: '메가박스' })).toBeChecked();
});
