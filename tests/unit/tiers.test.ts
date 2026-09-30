import { describe, expect, it } from 'vitest';
import { nextTierInfo, TIERS, tierForCount, unlockedTiers } from '../../src/lib/tiers';

describe('tierForCount', () => {
  it.each([
    [0, null],
    [1, 'normal'],
    [2, 'rare'],
    [3, 'holo'],
    [4, 'holo'],
    [5, 'ultra'],
    [6, 'ultra'],
    [7, 'secret'],
    [9, 'secret'],
    [10, 'legend'],
    [42, 'legend'],
  ])('%i회 → %s', (count, key) => {
    expect(tierForCount(count)?.key ?? null).toBe(key);
  });

  it('등급은 1..6 순서대로 기준 횟수가 증가한다', () => {
    expect(TIERS.map((t) => t.level)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].minViews).toBeGreaterThan(TIERS[i - 1].minViews);
  });
});

describe('nextTierInfo', () => {
  it('다음 등급까지 남은 횟수와 진행률', () => {
    expect(nextTierInfo(0)).toMatchObject({ next: { key: 'normal' }, remaining: 1, progress: 0 });
    expect(nextTierInfo(3)).toMatchObject({ next: { key: 'ultra' }, remaining: 2, progress: 0 });
    expect(nextTierInfo(4)).toMatchObject({ next: { key: 'ultra' }, remaining: 1, progress: 0.5 });
    expect(nextTierInfo(8)).toMatchObject({ next: { key: 'legend' }, remaining: 2, progress: 1 / 3 });
  });

  it('최고 등급이면 null', () => {
    expect(nextTierInfo(10)).toBeNull();
  });
});

describe('unlockedTiers', () => {
  it('해금된 등급 목록', () => {
    expect(unlockedTiers(5).map((t) => t.key)).toEqual(['normal', 'rare', 'holo', 'ultra']);
    expect(unlockedTiers(0)).toEqual([]);
  });
});
