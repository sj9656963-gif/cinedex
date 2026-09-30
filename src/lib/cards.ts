import type { ChainId } from './chains';
import { isTripleCrown, unlockingViewing, type MovieSummary } from './collection';
import { posterUrl, type PosterSize } from './tmdb';
import { getTier, type TierDef, type TierLevel } from './tiers';

/** 카드 한 장을 그리는 데 필요한 정보 */
export interface CardModel {
  movieId: string;
  title: string;
  subtitle?: string;
  year?: string;
  posterSrc?: string;
  customPoster?: Blob;
  tier: TierDef;
  count: number;
  chains: Partial<Record<ChainId, number>>;
  serial?: number;
  unlockedAt?: string;
  unlockedChain?: ChainId;
  tripleCrown: boolean;
}

/** 도감 요약 → 카드. level 을 주면 그 등급(해금된 것)의 카드, 없으면 현재 최고 등급 */
export function cardFromSummary(summary: MovieSummary, level?: TierLevel, size: PosterSize = 'w500'): CardModel {
  const tier = level ? getTier(level) : summary.tier;
  const { movie } = summary;
  const path = movie.tierPosters?.[tier.level - 1] ?? movie.tierPosters?.[0] ?? movie.posterPath;
  const unlock = unlockingViewing(summary, tier);
  return {
    movieId: movie.id,
    title: movie.title,
    subtitle: movie.originalTitle,
    year: movie.year,
    posterSrc: path ? posterUrl(path, size) : undefined,
    customPoster: movie.customPoster,
    tier,
    count: summary.count,
    chains: summary.chains,
    serial: unlock?.serial,
    unlockedAt: unlock?.watchedAt,
    unlockedChain: unlock?.chain,
    tripleCrown: isTripleCrown(summary.chains),
  };
}

/** 등급 안내·빈 도감에서 쓰는 견본 카드 */
export function sampleCard(tier: TierDef, title = '나의 인생 영화'): CardModel {
  return {
    movieId: 'sample',
    title,
    subtitle: 'My Life Movie',
    year: '2026',
    tier,
    count: tier.minViews,
    chains: { CGV: Math.ceil(tier.minViews / 2), MEGABOX: Math.floor(tier.minViews / 2) },
    serial: tier.minViews,
    tripleCrown: false,
  };
}
