/**
 * 등록 화면에서 고른 영화 → 저장용 MovieInput.
 * TMDB 영화는 이때 포스터 목록을 받아 등급별 "한정 포스터"를 배정한다.
 */
import { localMovieId, tmdbMovieId, type MovieInput } from './collection';
import type { MovieRecord } from './db';
import { assignTierPosters, moviePosters, releaseYear, toMovieInput, type TmdbMovie } from './tmdb';

export type MoviePick =
  | { kind: 'existing'; movie: MovieRecord; count: number }
  | { kind: 'tmdb'; movie: TmdbMovie }
  | { kind: 'manual'; title: string };

export interface PickInfo {
  title: string;
  sub: string;
  posterPath?: string;
  customPoster?: Blob;
}

export function describePick(pick: MoviePick): PickInfo {
  switch (pick.kind) {
    case 'existing':
      return {
        title: pick.movie.title,
        sub: `${pick.count}회 관람 → 이번이 ${pick.count + 1}회째`,
        posterPath: pick.movie.posterPath,
        customPoster: pick.movie.customPoster,
      };
    case 'tmdb': {
      const original = pick.movie.original_title !== pick.movie.title ? pick.movie.original_title : undefined;
      return {
        title: pick.movie.title,
        sub: [releaseYear(pick.movie), original].filter(Boolean).join(' · ') || 'TMDB',
        posterPath: pick.movie.poster_path ?? undefined,
      };
    }
    case 'manual':
      return { title: pick.title, sub: '직접 입력 · 포스터 그림은 자동으로 만들어져요' };
  }
}

function fromRecord(movie: MovieRecord): MovieInput {
  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    year: movie.year,
    tmdbId: movie.tmdbId,
    posterPath: movie.posterPath,
    tierPosters: movie.tierPosters,
  };
}

/** 등급별 포스터가 아직 제대로 배정되지 않은(포스터 1장뿐인) 영화 */
function needsTierPosters(movie: Pick<MovieRecord, 'tmdbId' | 'tierPosters'>): boolean {
  return movie.tmdbId !== undefined && (movie.tierPosters?.length ?? 0) < 2;
}

export async function resolveMovieInput(
  pick: MoviePick,
  token: string,
  known: ReadonlyMap<string, MovieRecord>,
  signal?: AbortSignal,
): Promise<MovieInput> {
  if (pick.kind === 'manual') {
    const title = pick.title.trim();
    return { id: localMovieId(title), title };
  }

  if (pick.kind === 'existing') {
    const base = fromRecord(pick.movie);
    if (!token || !needsTierPosters(pick.movie)) return base;
    try {
      const posters = await moviePosters(pick.movie.tmdbId!, token, signal);
      const tierPosters = assignTierPosters(pick.movie.posterPath, posters);
      return tierPosters.length ? { ...base, tierPosters } : base;
    } catch {
      return base;
    }
  }

  const existing = known.get(tmdbMovieId(pick.movie.id));
  if (existing && !needsTierPosters(existing)) return fromRecord(existing);
  if (!token) return toMovieInput(pick.movie);
  try {
    const posters = await moviePosters(pick.movie.id, token, signal);
    return toMovieInput(pick.movie, assignTierPosters(pick.movie.poster_path, posters));
  } catch {
    // 포스터 목록을 못 받아도 대표 포스터로 등록은 진행
    return toMovieInput(pick.movie);
  }
}
