/**
 * 극장 체인 정보와 티켓 코드 → 체인 추정.
 *
 * CGV·롯데시네마·메가박스는 티켓 QR/바코드 형식이나 인증 API를 공개하지 않는다.
 * 그래서 코드 안에 들어있는 도메인/키워드로만 추정하고, 확신할 수 없으면 null 을 돌려
 * 사용자가 직접 고르게 한다. 실제 티켓 샘플이 모이면 CHAIN_RULES 에 패턴을 추가하면 된다.
 */

export type ChainId = 'CGV' | 'LOTTE' | 'MEGABOX' | 'OTHER';

export interface ChainInfo {
  id: ChainId;
  name: string;
  /** 카드 위 작은 칩에 쓰는 약칭 */
  short: string;
  color: string;
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  CGV: { id: 'CGV', name: 'CGV', short: 'CGV', color: '#e5261b' },
  LOTTE: { id: 'LOTTE', name: '롯데시네마', short: 'LOTTE', color: '#1d1d1f' },
  MEGABOX: { id: 'MEGABOX', name: '메가박스', short: 'MEGA', color: '#5b2bb5' },
  OTHER: { id: 'OTHER', name: '기타 극장', short: 'ETC', color: '#4b5563' },
};

export const CHAIN_IDS: readonly ChainId[] = ['CGV', 'LOTTE', 'MEGABOX', 'OTHER'];

/** 3사 정복 배지 대상 */
export const MAJOR_CHAINS: readonly ChainId[] = ['CGV', 'LOTTE', 'MEGABOX'];

interface ChainRule {
  chain: Exclude<ChainId, 'OTHER'>;
  pattern: RegExp;
}

export const CHAIN_RULES: readonly ChainRule[] = [
  { chain: 'CGV', pattern: /(^|[^a-z])cgv([^a-z]|$)|cgv\.co\.kr/i },
  { chain: 'LOTTE', pattern: /lotte\s*cinema|lottecinema|lotte-?cinema|롯데\s*시네마/i },
  { chain: 'MEGABOX', pattern: /mega\s*-?box|메가박스/i },
];

export function detectChain(raw: string): Exclude<ChainId, 'OTHER'> | null {
  const text = raw.normalize('NFKC');
  for (const rule of CHAIN_RULES) {
    if (rule.pattern.test(text)) return rule.chain;
  }
  return null;
}

export function isChainId(value: unknown): value is ChainId {
  return typeof value === 'string' && (CHAIN_IDS as readonly string[]).includes(value);
}
