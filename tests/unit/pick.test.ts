import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MovieRecord } from '../../src/lib/db';
import { describePick, resolveMovieInput } from '../../src/lib/pick';
import type { TmdbMovie } from '../../src/lib/tmdb';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.sig';

const dune: TmdbMovie = {
  id: 693134,
  title: '듄: 파트 2',
  original_title: 'Dune: Part Two',
  release_date: '2024-02-28',
  poster_path: '/ko-main.jpg',
};

const posters = [
  { file_path: '/ko-main.jpg', iso_639_1: 'ko', vote_average: 6, width: 1, height: 1 },
  { file_path: '/ko-alt.jpg', iso_639_1: 'ko', vote_average: 5, width: 1, height: 1 },
  { file_path: '/art.jpg', iso_639_1: null, vote_average: 9, width: 1, height: 1 },
];

function mockImages(status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify({ posters }), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const record = (over: Partial<MovieRecord> = {}): MovieRecord => ({
  id: 'tmdb:693134',
  tmdbId: 693134,
  title: '듄: 파트 2',
  posterPath: '/ko-main.jpg',
  tierPosters: ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg'],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('resolveMovieInput', () => {
  it('직접 입력: 제목으로 로컬 영화 ID', async () => {
    const fetchMock = mockImages();
    await expect(resolveMovieInput({ kind: 'manual', title: '  우리 영화 ' }, TOKEN, new Map())).resolves.toEqual({
      id: 'local:우리영화',
      title: '우리 영화',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TMDB 영화: 포스터 목록을 받아 등급별 포스터 배정', async () => {
    const fetchMock = mockImages();
    const input = await resolveMovieInput({ kind: 'tmdb', movie: dune }, TOKEN, new Map());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(input).toMatchObject({ id: 'tmdb:693134', tmdbId: 693134, title: '듄: 파트 2', year: '2024' });
    expect(input.tierPosters).toEqual(['/ko-main.jpg', '/ko-alt.jpg', '/art.jpg', '/art.jpg', '/art.jpg', '/art.jpg']);
  });

  it('포스터 목록 요청이 실패해도 대표 포스터로 등록', async () => {
    mockImages(500);
    const input = await resolveMovieInput({ kind: 'tmdb', movie: dune }, TOKEN, new Map());
    expect(input.tierPosters).toEqual(['/ko-main.jpg']);
  });

  it('이미 도감에 있는 TMDB 영화는 저장된 포스터 배정을 그대로 쓴다 (다시 요청하지 않음)', async () => {
    const fetchMock = mockImages();
    const known = new Map([['tmdb:693134', record()]]);
    const input = await resolveMovieInput({ kind: 'tmdb', movie: dune }, TOKEN, known);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(input.tierPosters?.[1]).toBe('/b.jpg');
  });

  it('도감 영화의 포스터가 1장뿐이면 토큰이 있을 때 다시 배정', async () => {
    const fetchMock = mockImages();
    const movie = record({ tierPosters: ['/ko-main.jpg'] });
    const input = await resolveMovieInput({ kind: 'existing', movie, count: 1 }, TOKEN, new Map());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(input.tierPosters).toHaveLength(6);

    fetchMock.mockClear();
    const offline = await resolveMovieInput({ kind: 'existing', movie, count: 1 }, '', new Map());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(offline.tierPosters).toEqual(['/ko-main.jpg']);
  });

  it('사용자 포스터 사진(Blob)은 입력에 싣지 않는다 (기존 값 유지)', async () => {
    const movie = record({ customPoster: new Blob(['x']) });
    const input = await resolveMovieInput({ kind: 'existing', movie, count: 2 }, '', new Map());
    expect(input).not.toHaveProperty('customPoster');
  });
});

describe('describePick', () => {
  it('다시 본 영화는 몇 번째 관람인지 알려준다', () => {
    expect(describePick({ kind: 'existing', movie: record(), count: 4 }).sub).toBe('4회 관람 → 이번이 5회째');
    expect(describePick({ kind: 'tmdb', movie: dune }).sub).toBe('2024 · Dune: Part Two');
  });
});
