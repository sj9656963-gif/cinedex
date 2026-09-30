import { describe, expect, it } from 'vitest';
import { BackupFormatError, exportBackup, importBackup, parseBackup } from '../../src/lib/backup';
import { clearCollection, getCollection, localMovieId, registerViewing, setCustomPoster } from '../../src/lib/collection';
import { toScannedTicket } from '../../src/lib/ticket';

const movie = { id: localMovieId('백업 테스트'), title: '백업 테스트', year: '2026' };

async function seed() {
  for (const [i, chain] of (['CGV', 'LOTTE', 'MEGABOX'] as const).entries()) {
    await registerViewing({
      ticket: await toScannedTicket(`BACKUP-${i}-000`, 'manual'),
      chain,
      watchedAt: `2026-09-0${i + 1}`,
      movie,
    });
  }
  await setCustomPoster(movie.id, new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' }));
}

describe('backup', () => {
  it('내보내기 → 초기화 → 불러오기 하면 그대로 복원된다 (포스터 사진 포함)', async () => {
    await seed();
    const before = await getCollection();
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(file.movies[0].customPoster).toMatch(/^data:image\/png;base64,/);

    await clearCollection();
    expect(await importBackup(file)).toEqual({ movies: 1, viewings: 3, skipped: 0 });

    const after = await getCollection();
    expect(after).toHaveLength(1);
    expect(after[0].count).toBe(3);
    expect(after[0].chains).toEqual(before[0].chains);
    expect(after[0].viewings.map((v) => v.serial)).toEqual([1, 2, 3]);
    const poster = after[0].movie.customPoster!;
    expect(poster.type).toBe('image/png');
    expect([...new Uint8Array(await poster.arrayBuffer())]).toEqual([137, 80, 78, 71, 1, 2, 3]);
  });

  it('같은 백업을 두 번 불러와도 중복 티켓은 건너뛴다', async () => {
    await seed();
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    expect(await importBackup(file)).toEqual({ movies: 0, viewings: 0, skipped: 3 });
    expect((await getCollection())[0].count).toBe(3);
  });

  it('형식이 잘못된 파일은 거부한다', () => {
    expect(() => parseBackup({ app: 'other' })).toThrow(BackupFormatError);
    expect(() => parseBackup({ app: 'cinedex', version: 2, movies: [], viewings: [] })).toThrow(/버전/);
    const base = { app: 'cinedex', version: 1, exportedAt: '', serial: 0 };
    const goodMovie = { id: 'local:x', title: 'x', createdAt: 1, updatedAt: 1 };
    // 포스터 경로에 다른 주소를 끼워 넣는 시도
    expect(() =>
      parseBackup({ ...base, movies: [{ ...goodMovie, posterPath: 'https://evil.example/x.jpg' }], viewings: [] }),
    ).toThrow(/영화 #1/);
    // 이미지가 아닌 data URL
    expect(() =>
      parseBackup({ ...base, movies: [{ ...goodMovie, customPoster: 'data:text/html;base64,PHA+' }], viewings: [] }),
    ).toThrow(/영화 #1/);
    // 영화 정보 없는 관람 기록
    const viewing = {
      id: 'v1', movieId: 'local:none', ticketHash: 'a'.repeat(64), codeHint: '••••1', source: 'manual',
      chain: 'CGV', watchedAt: '2026-09-30', registeredAt: 1, serial: 1,
    };
    expect(() => parseBackup({ ...base, movies: [goodMovie], viewings: [viewing] })).toThrow(/영화 정보가 없는/);
    expect(() => parseBackup({ ...base, movies: [goodMovie], viewings: [{ ...viewing, chain: 'IMAX' }] })).toThrow(
      /관람 기록 #1/,
    );
  });
});
