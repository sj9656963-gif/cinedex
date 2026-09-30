/**
 * 카드 등급. 같은 영화를 볼수록(누적 관람 횟수) 더 희귀하고 화려한 카드가 해금된다.
 * 기준 횟수는 여기 한 곳에서만 관리한다.
 */

export type TierLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TierKey = 'normal' | 'rare' | 'holo' | 'ultra' | 'secret' | 'legend';

export interface TierDef {
  level: TierLevel;
  key: TierKey;
  /** 한글 등급명 */
  name: string;
  /** 카드에 찍히는 약칭 */
  label: string;
  /** 해금에 필요한 누적 관람 횟수 */
  minViews: number;
  stars: number;
  /** 풀아트(포스터가 카드 전체를 덮는) 레이아웃 여부 */
  fullArt: boolean;
  effect: string;
}

export const TIERS: readonly TierDef[] = [
  { level: 1, key: 'normal', name: '노멀', label: 'N', minViews: 1, stars: 0, fullArt: false, effect: '크림색 프레임의 기본 포스터 카드' },
  { level: 2, key: 'rare', name: '레어', label: 'R', minViews: 2, stars: 1, fullArt: false, effect: '메탈 실버 프레임 + 움직이는 빛 반사' },
  { level: 3, key: 'holo', name: '홀로 레어', label: 'HR', minViews: 3, stars: 2, fullArt: false, effect: '포스터 위에 무지개 홀로그램 호일' },
  { level: 4, key: 'ultra', name: '울트라 레어', label: 'UR', minViews: 5, stars: 3, fullArt: true, effect: '골드 풀아트 + 반짝이 글리터 + 전면 홀로' },
  { level: 5, key: 'secret', name: '시크릿 레어', label: 'SR', minViews: 7, stars: 4, fullArt: true, effect: '레인보우 풀아트 + 회전하는 오로라 테두리와 후광' },
  { level: 6, key: 'legend', name: '레전드', label: 'LEGEND', minViews: 10, stars: 5, fullArt: true, effect: '블랙 골드 풀아트 + 황금 오라와 떠오르는 빛 입자' },
];

export const MAX_TIER = TIERS[TIERS.length - 1];

export function getTier(level: TierLevel): TierDef {
  return TIERS[level - 1];
}

/** 관람 횟수에 해당하는 최고 등급. 0회면 null */
export function tierForCount(count: number): TierDef | null {
  let result: TierDef | null = null;
  for (const tier of TIERS) {
    if (count >= tier.minViews) result = tier;
  }
  return result;
}

export function unlockedTiers(count: number): TierDef[] {
  return TIERS.filter((tier) => count >= tier.minViews);
}

export interface NextTierInfo {
  next: TierDef;
  /** 다음 등급까지 남은 관람 횟수 */
  remaining: number;
  /** 현재 등급 → 다음 등급 구간의 진행률 0..1 */
  progress: number;
}

/** 다음 등급 정보. 최고 등급이면 null */
export function nextTierInfo(count: number): NextTierInfo | null {
  const next = TIERS.find((tier) => tier.minViews > count);
  if (!next) return null;
  const currentMin = tierForCount(count)?.minViews ?? 0;
  const span = next.minViews - currentMin;
  return {
    next,
    remaining: next.minViews - count,
    progress: span > 0 ? (count - currentMin) / span : 0,
  };
}
