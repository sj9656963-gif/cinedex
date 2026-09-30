/**
 * TMDB(The Movie Database) 연동 — 영화 검색, 국내 현재 상영작, 등급별 포스터.
 * https://developer.themoviedb.org/docs
 *
 * 사용자가 설정에서 입력한 토큰으로 브라우저에서 직접 호출한다. (API 는 CORS 허용)
 * - v4 "API 읽기 액세스 토큰"(eyJ… 로 시작하는 JWT) → Authorization: Bearer 헤더
 * - v3 "API 키"(32자리) → api_key 쿼리
 */
import type { MovieInput } from './collection';
import { tmdbMovieId } from './collection';

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780';

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  poster_path: string | null;
  overview?: string;
}

export interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  width: number;
  height: number;
}

interface ListResponse {
  results: TmdbMovie[];
}

interface ImagesResponse {
  posters: TmdbImage[];
}

export class TmdbError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

export function posterUrl(path: string, size: PosterSize = 'w500'): string {
  return `${IMAGE_BASE}/${size}${path}`;
}

export function isBearerToken(token: string): boolean {
  return token.startsWith('eyJ') && token.split('.').length === 3;
}

async function request<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  const credential = token.trim();
  if (!credential) throw new TmdbError('TMDB 토큰이 설정되지 않았어요.', 0);

  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (isBearerToken(credential)) headers.Authorization = `Bearer ${credential}`;
  else url.searchParams.set('api_key', credential);

  let response: Response;
  try {
    response = await fetch(url, { headers, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new TmdbError('TMDB 서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  if (response.status === 401) throw new TmdbError('TMDB 토큰이 올바르지 않아요. 설정에서 다시 확인해 주세요.', 401);
  if (response.status === 429) throw new TmdbError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
  if (!response.ok) throw new TmdbError(`TMDB 요청에 실패했어요. (${response.status})`, response.status);
  return (await response.json()) as T;
}

export async function searchMovies(query: string, token: string, signal?: AbortSignal): Promise<TmdbMovie[]> {
  const data = await request<ListResponse>(
    '/search/movie',
    { query, language: 'ko-KR', region: 'KR', include_adult: 'false', page: '1' },
    token,
    signal,
  );
  return data.results ?? [];
}

/** 국내 현재 상영작 — 티켓은 대부분 지금 상영 중인 영화라 첫 화면 추천으로 쓴다. */
export async function nowPlaying(token: string, signal?: AbortSignal): Promise<TmdbMovie[]> {
  const data = await request<ListResponse>(
    '/movie/now_playing',
    { language: 'ko-KR', region: 'KR', page: '1' },
    token,
    signal,
  );
  return data.results ?? [];
}

export async function moviePosters(tmdbId: number, token: string, signal?: AbortSignal): Promise<TmdbImage[]> {
  const data = await request<ImagesResponse>(
    `/movie/${tmdbId}/images`,
    { include_image_language: 'ko,null,en' },
    token,
    signal,
  );
  return data.posters ?? [];
}

export async function verifyToken(token: string, signal?: AbortSignal): Promise<void> {
  await request<unknown>('/configuration', {}, token, signal);
}

/**
 * 등급별로 다른 포스터를 배정한다. (같은 영화라도 등급마다 다른 "한정 이미지")
 * - 노멀~홀로(1~3): 대표 한국어 포스터 → 다른 한국어/영어 포스터
 * - 울트라~레전드(4~6, 풀아트): 글자 없는(textless) 아트 포스터 우선
 * 포스터가 부족하면 직전 등급 이미지를 재사용한다.
 */
export function assignTierPosters(mainPoster: string | null | undefined, posters: TmdbImage[], tierCount = 6): string[] {
  const ranked = [...posters].sort((a, b) => b.vote_average - a.vote_average);
  const pick = (filter: (p: TmdbImage) => boolean) => ranked.filter(filter).map((p) => p.file_path);
  const korean = pick((p) => p.iso_639_1 === 'ko');
  const english = pick((p) => p.iso_639_1 === 'en');
  const textless = pick((p) => p.iso_639_1 === null || p.iso_639_1 === 'xx');
  const others = pick((p) => !['ko', 'en', 'xx', null].includes(p.iso_639_1));

  const first = mainPoster ?? korean[0] ?? english[0] ?? textless[0] ?? others[0];
  if (!first) return [];

  const used = new Set([first]);
  const take = (pools: string[][]) => {
    for (const pool of pools) {
      const found = pool.find((p) => !used.has(p));
      if (found) {
        used.add(found);
        return found;
      }
    }
    return undefined;
  };

  const result = [first];
  const fullArtFrom = Math.ceil(tierCount / 2);
  for (let i = 1; i < tierCount; i++) {
    const next = i < fullArtFrom ? take([korean, english, others, textless]) : take([textless, korean, english, others]);
    result.push(next ?? result[i - 1]);
  }
  return result;
}

export function releaseYear(movie: Pick<TmdbMovie, 'release_date'>): string | undefined {
  return movie.release_date?.slice(0, 4) || undefined;
}

export function toMovieInput(movie: TmdbMovie, tierPosters?: string[]): MovieInput {
  return {
    id: tmdbMovieId(movie.id),
    tmdbId: movie.id,
    title: movie.title || movie.original_title,
    originalTitle: movie.original_title && movie.original_title !== movie.title ? movie.original_title : undefined,
    year: releaseYear(movie),
    posterPath: movie.poster_path ?? undefined,
    tierPosters: tierPosters?.length ? tierPosters : movie.poster_path ? [movie.poster_path] : undefined,
  };
}
