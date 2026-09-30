import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignTierPosters,
  isBearerToken,
  moviePosters,
  nowPlaying,
  posterUrl,
  searchMovies,
  TmdbError,
  toMovieInput,
  type TmdbImage,
} from '../../src/lib/tmdb';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.signature';
const V3_KEY = '0123456789abcdef0123456789abcdef';

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: URL | string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('인증 방식', () => {
  it('v4 토큰은 Bearer 헤더, v3 키는 api_key 쿼리', async () => {
    const fetchMock = mockFetch({ results: [] });
    await searchMovies('듄', JWT);
    let [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get('api_key')).toBeNull();
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`);

    await searchMovies('듄', V3_KEY);
    [url, init] = fetchMock.mock.calls[1];
    expect(new URL(url).searchParams.get('api_key')).toBe(V3_KEY);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('isBearerToken', () => {
    expect(isBearerToken(JWT)).toBe(true);
    expect(isBearerToken(V3_KEY)).toBe(false);
  });
});

describe('API 호출', () => {
  it('검색은 한국어·한국 지역으로 요청한다', async () => {
    const fetchMock = mockFetch({ results: [{ id: 1, title: '듄', original_title: 'Dune', poster_path: '/p.jpg' }] });
    const results = await searchMovies('듄', JWT);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/3/search/movie');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ query: '듄', language: 'ko-KR', region: 'KR', include_adult: 'false' });
    expect(results[0].title).toBe('듄');
  });

  it('현재 상영작 / 포스터 목록', async () => {
    const fetchMock = mockFetch({ results: [], posters: [] });
    await nowPlaying(JWT);
    await moviePosters(42, JWT);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/3/movie/now_playing');
    const imagesUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(imagesUrl.pathname).toBe('/3/movie/42/images');
    expect(imagesUrl.searchParams.get('include_image_language')).toBe('ko,null,en');
  });

  it('401 이면 토큰 오류 메시지', async () => {
    mockFetch({ status_message: 'Invalid API key' }, 401);
    const error = await searchMovies('x', JWT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TmdbError);
    expect((error as TmdbError).status).toBe(401);
    expect((error as TmdbError).message).toContain('토큰');
  });

  it('토큰이 없으면 요청하지 않는다', async () => {
    const fetchMock = mockFetch({});
    await expect(searchMovies('x', '  ')).rejects.toBeInstanceOf(TmdbError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('네트워크 오류는 안내 메시지로 바꾼다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(searchMovies('x', JWT)).rejects.toThrow(/인터넷 연결/);
  });
});

const img = (file_path: string, iso_639_1: string | null, vote_average = 5): TmdbImage => ({
  file_path, iso_639_1, vote_average, width: 1000, height: 1500,
});

describe('assignTierPosters', () => {
  it('낮은 등급은 한국어 포스터, 풀아트 등급은 글자 없는 포스터를 우선 배정', () => {
    const posters = [
      img('/ko-main.jpg', 'ko', 6),
      img('/ko-alt.jpg', 'ko', 5),
      img('/en-1.jpg', 'en', 7),
      img('/textless-1.jpg', null, 8),
      img('/textless-2.jpg', null, 4),
    ];
    expect(assignTierPosters('/ko-main.jpg', posters)).toEqual([
      '/ko-main.jpg',
      '/ko-alt.jpg',
      '/en-1.jpg',
      '/textless-1.jpg',
      '/textless-2.jpg',
      '/textless-2.jpg',
    ]);
  });

  it('포스터가 하나뿐이면 모든 등급이 같은 이미지', () => {
    expect(assignTierPosters('/only.jpg', [])).toEqual(Array(6).fill('/only.jpg'));
  });

  it('포스터가 전혀 없으면 빈 배열 (생성 아트 사용)', () => {
    expect(assignTierPosters(null, [])).toEqual([]);
  });

  it('대표 포스터가 없으면 목록에서 고른다', () => {
    expect(assignTierPosters(undefined, [img('/en.jpg', 'en')])[0]).toBe('/en.jpg');
  });
});

describe('변환', () => {
  it('posterUrl', () => {
    expect(posterUrl('/a.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/a.jpg');
  });

  it('toMovieInput', () => {
    expect(
      toMovieInput({ id: 7, title: '듄', original_title: 'Dune', release_date: '2021-10-20', poster_path: '/d.jpg' }),
    ).toEqual({
      id: 'tmdb:7',
      tmdbId: 7,
      title: '듄',
      originalTitle: 'Dune',
      year: '2021',
      posterPath: '/d.jpg',
      tierPosters: ['/d.jpg'],
    });
  });
});
