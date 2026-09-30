import { describe, expect, it } from 'vitest';
import { cardFromSummary } from '../../src/lib/cards';
import {
  clearCollection,
  deleteViewing,
  DuplicateTicketError,
  findTicket,
  getCollection,
  getMovieSummary,
  isTripleCrown,
  localMovieId,
  registerViewing,
  setCustomPoster,
  type MovieInput,
} from '../../src/lib/collection';
import type { ChainId } from '../../src/lib/chains';
import { toScannedTicket } from '../../src/lib/ticket';

const dune: MovieInput = {
  id: 'tmdb:693134',
  tmdbId: 693134,
  title: '듄: 파트 2',
  originalTitle: 'Dune: Part Two',
  year: '2024',
  posterPath: '/main.jpg',
  tierPosters: ['/t1.jpg', '/t2.jpg', '/t3.jpg', '/t4.jpg', '/t5.jpg', '/t6.jpg'],
};

async function watch(code: string, movie: MovieInput = dune, chain: ChainId = 'CGV', watchedAt = '2026-09-30') {
  return registerViewing({ ticket: await toScannedTicket(code, 'manual'), chain, watchedAt, movie });
}

describe('registerViewing', () => {
  it('첫 관람은 노멀, 두 번째는 레어로 등급 업', async () => {
    const first = await watch('TICKET-0001');
    expect(first).toMatchObject({ count: 1, previousTier: null, tier: { key: 'normal' }, tierUp: true });
    expect(first.viewing.serial).toBe(1);

    const second = await watch('TICKET-0002', dune, 'MEGABOX');
    expect(second).toMatchObject({ count: 2, previousTier: { key: 'normal' }, tier: { key: 'rare' }, tierUp: true });
    expect(second.viewing.serial).toBe(2);
  });

  it('같은 등급 안에서의 관람은 tierUp 이 아니다', async () => {
    for (let i = 1; i <= 3; i++) await watch(`CODE-${i}-XYZ`);
    const fourth = await watch('CODE-4-XYZ');
    expect(fourth).toMatchObject({ count: 4, tier: { key: 'holo' }, tierUp: false });
  });

  it('같은 티켓은 두 번 등록할 수 없다 (하이픈 유무가 달라도 동일 티켓)', async () => {
    await watch('1234-5678-9012');
    const error = await watch('123456789012').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateTicketError);
    expect((error as DuplicateTicketError).movie?.title).toBe('듄: 파트 2');
    const summary = await getMovieSummary(dune.id);
    expect(summary?.count).toBe(1);
  });

  it('다른 영화에 같은 티켓을 써도 막힌다', async () => {
    await watch('SHARED-TICKET-1');
    const other: MovieInput = { id: localMovieId('다른 영화'), title: '다른 영화' };
    await expect(watch('SHARED-TICKET-1', other)).rejects.toBeInstanceOf(DuplicateTicketError);
    expect(await getMovieSummary(other.id)).toBeNull();
  });

  it('원본 티켓 번호는 저장하지 않는다', async () => {
    const result = await watch('SECRET-NUMBER-777888');
    expect(JSON.stringify(result.viewing)).not.toContain('SECRET-NUMBER-777888');
    expect(result.viewing.codeHint).toBe('••••7888');
    expect(await findTicket(result.viewing.ticketHash)).not.toBeNull();
  });
});

describe('도감 요약', () => {
  it('영화별 관람 횟수, 극장별 횟수, 최근 등록순 정렬', async () => {
    const local: MovieInput = { id: localMovieId('우리들의 영화'), title: '우리들의 영화' };
    await watch('A-000001', dune, 'CGV', '2026-09-01');
    await watch('A-000002', dune, 'LOTTE', '2026-09-10');
    await watch('A-000003', local, 'MEGABOX', '2026-09-20');
    await watch('A-000004', dune, 'MEGABOX', '2026-09-05');

    const items = await getCollection();
    expect(items.map((s) => s.movie.id)).toEqual([dune.id, local.id]);
    const d = items[0];
    expect(d.count).toBe(3);
    expect(d.tier.key).toBe('holo');
    expect(d.chains).toEqual({ CGV: 1, LOTTE: 1, MEGABOX: 1, OTHER: 0 });
    expect(d.firstWatchedAt).toBe('2026-09-01');
    expect(d.lastWatchedAt).toBe('2026-09-10');
    expect(isTripleCrown(d.chains)).toBe(true);
    expect(isTripleCrown(items[1].chains)).toBe(false);
  });

  it('등급별 카드는 해당 등급 포스터와 해금시킨 관람의 일련번호를 쓴다', async () => {
    await watch('B-000001', dune, 'CGV', '2026-09-01');
    await watch('B-000002', dune, 'LOTTE', '2026-09-02');
    await watch('B-000003', dune, 'MEGABOX', '2026-09-03');
    const summary = (await getMovieSummary(dune.id))!;

    const top = cardFromSummary(summary);
    expect(top.tier.key).toBe('holo');
    expect(top.posterSrc).toBe('https://image.tmdb.org/t/p/w500/t3.jpg');
    expect(top).toMatchObject({ serial: 3, unlockedAt: '2026-09-03', unlockedChain: 'MEGABOX', tripleCrown: true });

    const normal = cardFromSummary(summary, 1, 'w342');
    expect(normal.posterSrc).toBe('https://image.tmdb.org/t/p/w342/t1.jpg');
    expect(normal).toMatchObject({ serial: 1, unlockedChain: 'CGV' });
  });

  it('직접 입력한 제목은 띄어쓰기·대소문자가 달라도 같은 영화로 묶인다', () => {
    expect(localMovieId('인사이드 아웃 2')).toBe(localMovieId('인사이드아웃2'));
    expect(localMovieId('Inside Out 2!')).toBe(localMovieId('inside out 2'));
    expect(localMovieId('인사이드 아웃 2')).not.toBe(localMovieId('인사이드 아웃'));
  });
});

describe('삭제/수정', () => {
  it('관람 기록을 지우면 등급이 내려가고, 모두 지우면 카드도 사라진다', async () => {
    const first = await watch('C-000001');
    const second = await watch('C-000002');
    expect((await getMovieSummary(dune.id))?.tier.key).toBe('rare');

    expect(await deleteViewing(second.viewing.id)).toEqual({ movieDeleted: false });
    expect((await getMovieSummary(dune.id))?.tier.key).toBe('normal');

    expect(await deleteViewing(first.viewing.id)).toEqual({ movieDeleted: true });
    expect(await getMovieSummary(dune.id)).toBeNull();
    expect(await getCollection()).toEqual([]);

    // 지운 티켓은 다시 등록할 수 있다
    await expect(watch('C-000001')).resolves.toMatchObject({ count: 1 });
  });

  it('포스터 사진을 바꾸고 되돌릴 수 있다', async () => {
    await watch('D-000001');
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await setCustomPoster(dune.id, photo);
    expect((await getMovieSummary(dune.id))?.movie.customPoster?.size).toBe(3);
    await setCustomPoster(dune.id, undefined);
    expect((await getMovieSummary(dune.id))?.movie.customPoster).toBeUndefined();
  });

  it('전체 초기화하면 일련번호도 처음부터', async () => {
    await watch('E-000001');
    await watch('E-000002');
    await clearCollection();
    expect(await getCollection()).toEqual([]);
    expect((await watch('E-000003')).viewing.serial).toBe(1);
  });
});
