import { expect, shot, test } from './helpers';

// 아이폰 사파리로 접속한 상황 (홈 화면 앱이 아닌 일반 탭)
test.use({
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
});

test('아이폰 사파리에서는 홈 화면에 추가하라는 안내와 데이터 옮기는 방법을 보여준다', async ({ page }) => {
  await page.goto('./#/settings');
  const note = page.getByRole('note');
  await expect(note).toContainText('아이폰은 홈 화면에 추가해서 쓰세요.');
  await expect(note).toContainText('7일 동안 들어오지 않으면');
  await expect(note).toContainText('백업 불러오기');
  // 토큰 입력칸 옆 버튼이 한 줄로 보이는지 (좁은 화면에서 줄바꿈 방지)
  const toggle = page.getByRole('button', { name: '보기' });
  const box = await toggle.boundingBox();
  expect(box!.height).toBeLessThan(44);
  await shot(page, '43-settings-ios');
});
