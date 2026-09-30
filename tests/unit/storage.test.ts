import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerViewing } from '../../src/lib/collection';
import { getSettings, updateSettings } from '../../src/lib/settings';
import { ensurePersistence, getPersistState, getUsageBytes, isIOS, requestPersistence } from '../../src/lib/storage';
import { toScannedTicket } from '../../src/lib/ticket';
import { formatBytes } from '../../src/lib/util';

function stubStorage(initial: boolean, grant: boolean) {
  let persisted = initial;
  const persist = vi.fn(async () => {
    persisted = grant;
    return grant;
  });
  const storage = { persisted: vi.fn(async () => persisted), persist, estimate: vi.fn(async () => ({ usage: 2048, quota: 1e9 })) };
  vi.stubGlobal('navigator', { storage, userAgent: '', maxTouchPoints: 0 });
  return { persist };
}

afterEach(() => vi.unstubAllGlobals());

describe('영구 보관', () => {
  it('브라우저가 허용하면 영구 보관, 거절하면 기본 보관', async () => {
    stubStorage(false, true);
    expect(await getPersistState()).toBe('best-effort');
    expect(await requestPersistence()).toBe('persisted');
    expect(await getPersistState()).toBe('persisted');

    stubStorage(false, false);
    expect(await requestPersistence()).toBe('best-effort');
  });

  it('이미 영구 보관이면 다시 요청하지 않는다', async () => {
    const { persist } = stubStorage(true, true);
    expect(await requestPersistence()).toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('Storage API 가 없는 브라우저', async () => {
    vi.stubGlobal('navigator', { userAgent: '' });
    expect(await getPersistState()).toBe('unsupported');
    expect(await requestPersistence()).toBe('unsupported');
    expect(await getUsageBytes()).toBeNull();
  });

  it('관람 기록이 생긴 뒤에만 요청한다 (첫 화면에서 허용 창을 띄우지 않음)', async () => {
    const { persist } = stubStorage(false, true);
    expect(await ensurePersistence()).toBe('best-effort');
    expect(persist).not.toHaveBeenCalled();

    await registerViewing({
      ticket: await toScannedTicket('PERSIST-0001', 'manual'),
      chain: 'CGV',
      watchedAt: '2026-09-30',
      movie: { id: 'local:영구', title: '영구' },
    });
    expect(await ensurePersistence()).toBe('persisted');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('사용 공간', async () => {
    stubStorage(false, false);
    expect(await getUsageBytes()).toBe(2048);
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2_400_000)).toBe('2.3MB');
  });
});

describe('isIOS', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1', 0, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15', 0, false],
    ['Mozilla/5.0 (Linux; Android 16; SM-S938N) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 5, false],
  ])('%s (touch %i) → %s', (ua, touch, expected) => {
    expect(isIOS(ua, touch)).toBe(expected);
  });
});

describe('마지막 백업 시각', () => {
  it('설정에 저장되고 잘못된 값은 무시한다', () => {
    updateSettings({ lastBackupAt: 1_790_000_000_000 });
    expect(getSettings().lastBackupAt).toBe(1_790_000_000_000);
  });
});
