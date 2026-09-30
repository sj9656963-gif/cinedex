import { CHAIN_IDS, MAJOR_CHAINS, type ChainId } from './chains';
import { getDB, type MovieRecord, type ViewingRecord } from './db';
import type { ScannedTicket } from './ticket';
import { tierForCount, type TierDef } from './tiers';
import { uid } from './util';

export interface MovieInput {
  id: string;
  title: string;
  originalTitle?: string;
  year?: string;
  tmdbId?: number;
  posterPath?: string;
  tierPosters?: string[];
  customPoster?: Blob;
}

export class DuplicateTicketError extends Error {
  readonly viewing: ViewingRecord;
  readonly movie?: MovieRecord;

  constructor(viewing: ViewingRecord, movie?: MovieRecord) {
    super('이미 등록된 티켓입니다.');
    this.name = 'DuplicateTicketError';
    this.viewing = viewing;
    this.movie = movie;
  }
}

export interface RegisterInput {
  ticket: ScannedTicket;
  chain: ChainId;
  watchedAt: string;
  movie: MovieInput;
}

export interface RegisterResult {
  movie: MovieRecord;
  viewing: ViewingRecord;
  count: number;
  previousTier: TierDef | null;
  tier: TierDef;
  tierUp: boolean;
}

export interface MovieSummary {
  movie: MovieRecord;
  /** 등록 순(serial 오름차순) */
  viewings: ViewingRecord[];
  count: number;
  tier: TierDef;
  chains: Record<ChainId, number>;
  firstWatchedAt: string;
  lastWatchedAt: string;
  lastRegisteredAt: number;
  /** 가장 최근 등록한 관람의 일련번호 (정렬용, 같은 ms 에 등록돼도 순서가 확실함) */
  lastSerial: number;
}

/** 직접 입력한 제목 → 로컬 영화 ID. 띄어쓰기/대소문자/문장부호가 달라도 같은 영화로 묶는다. */
export function localMovieId(title: string): string {
  const key = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
  return `local:${key || 'untitled'}`;
}

export function tmdbMovieId(tmdbId: number): string {
  return `tmdb:${tmdbId}`;
}

export async function findTicket(hash: string): Promise<{ viewing: ViewingRecord; movie?: MovieRecord } | null> {
  const db = await getDB();
  const viewing = await db.getFromIndex('viewings', 'by-hash', hash);
  if (!viewing) return null;
  return { viewing, movie: await db.get('movies', viewing.movieId) };
}

function mergeMovie(existing: MovieRecord | undefined, input: MovieInput, now: number): MovieRecord {
  return {
    id: input.id,
    title: input.title.trim() || existing?.title || '제목 없음',
    originalTitle: input.originalTitle ?? existing?.originalTitle,
    year: input.year ?? existing?.year,
    tmdbId: input.tmdbId ?? existing?.tmdbId,
    posterPath: input.posterPath ?? existing?.posterPath,
    tierPosters: input.tierPosters?.length ? input.tierPosters : existing?.tierPosters,
    customPoster: input.customPoster ?? existing?.customPoster,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function registerViewing(input: RegisterInput): Promise<RegisterResult> {
  const db = await getDB();
  const tx = db.transaction(['movies', 'viewings', 'meta'], 'readwrite');
  // 중간에 실패해서 트랜잭션이 abort 되어도 unhandled rejection 이 나지 않게 한다.
  tx.done.catch(() => undefined);
  const movies = tx.objectStore('movies');
  const viewings = tx.objectStore('viewings');
  const meta = tx.objectStore('meta');

  const duplicate = await viewings.index('by-hash').get(input.ticket.hash);
  if (duplicate) {
    const movie = await movies.get(duplicate.movieId);
    await tx.done;
    throw new DuplicateTicketError(duplicate, movie);
  }

  const previousCount = await viewings.index('by-movie').count(input.movie.id);
  const existing = await movies.get(input.movie.id);
  const serial = ((await meta.get('serial'))?.value ?? 0) + 1;
  const now = Date.now();

  const movie = mergeMovie(existing, input.movie, now);
  const viewing: ViewingRecord = {
    id: uid(),
    movieId: movie.id,
    ticketHash: input.ticket.hash,
    codeHint: input.ticket.hint,
    codeFormat: input.ticket.format,
    source: input.ticket.source,
    chain: input.chain,
    watchedAt: input.watchedAt,
    registeredAt: now,
    serial,
  };

  try {
    await movies.put(movie);
    await viewings.add(viewing);
    await meta.put({ key: 'serial', value: serial });
    await tx.done;
  } catch (error) {
    // 동시에 같은 티켓을 등록한 경우 unique index 가 막아준다.
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      const found = await findTicket(input.ticket.hash);
      if (found) throw new DuplicateTicketError(found.viewing, found.movie);
    }
    throw error;
  }

  const count = previousCount + 1;
  const previousTier = tierForCount(previousCount);
  const tier = tierForCount(count)!;
  return { movie, viewing, count, previousTier, tier, tierUp: tier.level !== previousTier?.level };
}

function emptyChainCounts(): Record<ChainId, number> {
  return Object.fromEntries(CHAIN_IDS.map((id) => [id, 0])) as Record<ChainId, number>;
}

export function summarize(movie: MovieRecord, viewings: ViewingRecord[]): MovieSummary | null {
  if (viewings.length === 0) return null;
  const sorted = [...viewings].sort((a, b) => a.serial - b.serial);
  const chains = emptyChainCounts();
  for (const v of sorted) chains[v.chain] += 1;
  const dates = sorted.map((v) => v.watchedAt).sort();
  return {
    movie,
    viewings: sorted,
    count: sorted.length,
    tier: tierForCount(sorted.length)!,
    chains,
    firstWatchedAt: dates[0],
    lastWatchedAt: dates[dates.length - 1],
    lastRegisteredAt: Math.max(...sorted.map((v) => v.registeredAt)),
    lastSerial: sorted[sorted.length - 1].serial,
  };
}

/** 도감 전체. 최근 등록한 영화가 앞 */
export async function getCollection(): Promise<MovieSummary[]> {
  const db = await getDB();
  const [movies, viewings] = await Promise.all([db.getAll('movies'), db.getAll('viewings')]);
  const byMovie = new Map<string, ViewingRecord[]>();
  for (const v of viewings) {
    const list = byMovie.get(v.movieId);
    if (list) list.push(v);
    else byMovie.set(v.movieId, [v]);
  }
  return movies
    .map((m) => summarize(m, byMovie.get(m.id) ?? []))
    .filter((s): s is MovieSummary => s !== null)
    .sort((a, b) => b.lastSerial - a.lastSerial);
}

export async function getMovieSummary(movieId: string): Promise<MovieSummary | null> {
  const db = await getDB();
  const movie = await db.get('movies', movieId);
  if (!movie) return null;
  return summarize(movie, await db.getAllFromIndex('viewings', 'by-movie', movieId));
}

/** 관람 기록 삭제. 남은 기록이 없으면 영화 카드도 도감에서 지운다. */
export async function deleteViewing(viewingId: string): Promise<{ movieDeleted: boolean }> {
  const db = await getDB();
  const tx = db.transaction(['movies', 'viewings'], 'readwrite');
  const viewing = await tx.objectStore('viewings').get(viewingId);
  if (!viewing) {
    await tx.done;
    return { movieDeleted: false };
  }
  await tx.objectStore('viewings').delete(viewingId);
  const remaining = await tx.objectStore('viewings').index('by-movie').count(viewing.movieId);
  if (remaining === 0) await tx.objectStore('movies').delete(viewing.movieId);
  await tx.done;
  return { movieDeleted: remaining === 0 };
}

export async function setCustomPoster(movieId: string, poster: Blob | undefined): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('movies', 'readwrite');
  const movie = await tx.store.get(movieId);
  if (movie) await tx.store.put({ ...movie, customPoster: poster, updatedAt: Date.now() });
  await tx.done;
}

export async function clearCollection(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['movies', 'viewings', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('movies').clear(),
    tx.objectStore('viewings').clear(),
    tx.objectStore('meta').clear(),
    tx.done,
  ]);
}

/** 해당 등급을 해금시킨 관람 기록 (n번째 관람) */
export function unlockingViewing(summary: MovieSummary, tier: TierDef): ViewingRecord | undefined {
  return summary.viewings[tier.minViews - 1];
}

/** CGV·롯데시네마·메가박스 3사 모두에서 관람 */
export function isTripleCrown(chains: Record<ChainId, number>): boolean {
  return MAJOR_CHAINS.every((id) => chains[id] > 0);
}
