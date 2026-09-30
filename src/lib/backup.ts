/**
 * 백업/복원. 데이터가 기기(브라우저) 안에만 저장되므로, 기기 변경·브라우저 데이터 삭제에 대비해
 * JSON 파일로 내보내고 다시 불러올 수 있게 한다. 사용자가 올린 포스터 사진은 data URL 로 포함한다.
 */
import { isChainId } from './chains';
import { getDB, type MovieRecord, type ViewingRecord } from './db';

export interface BackupMovie extends Omit<MovieRecord, 'customPoster'> {
  customPoster?: string;
}

export interface BackupFile {
  app: 'cinedex';
  version: 1;
  exportedAt: string;
  serial: number;
  movies: BackupMovie[];
  viewings: ViewingRecord[];
}

export interface ImportResult {
  movies: number;
  viewings: number;
  skipped: number;
}

export class BackupFormatError extends Error {
  constructor(detail: string) {
    super(`올바른 씨네덱스 백업 파일이 아니에요. (${detail})`);
    this.name = 'BackupFormatError';
  }
}

const POSTER_PATH = /^\/[\w.-]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/;
const SOURCES = ['camera', 'image', 'manual'];

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, base64] = dataUrl.split(',', 2);
  const type = head.slice(5, head.indexOf(';'));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(): Promise<BackupFile> {
  const db = await getDB();
  const [movies, viewings, serial] = await Promise.all([
    db.getAll('movies'),
    db.getAll('viewings'),
    db.get('meta', 'serial'),
  ]);
  return {
    app: 'cinedex',
    version: 1,
    exportedAt: new Date().toISOString(),
    serial: serial?.value ?? 0,
    movies: await Promise.all(
      movies.map(async ({ customPoster, ...rest }) => ({
        ...rest,
        ...(customPoster ? { customPoster: await blobToDataUrl(customPoster) } : {}),
      })),
    ),
    viewings,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const optionalString = (v: unknown) => v === undefined || typeof v === 'string';

function validMovie(m: unknown): m is BackupMovie {
  return (
    isObject(m) &&
    typeof m.id === 'string' &&
    /^(tmdb|local):/.test(m.id) &&
    typeof m.title === 'string' &&
    optionalString(m.originalTitle) &&
    optionalString(m.year) &&
    (m.tmdbId === undefined || Number.isInteger(m.tmdbId)) &&
    (m.posterPath === undefined || (typeof m.posterPath === 'string' && POSTER_PATH.test(m.posterPath))) &&
    (m.tierPosters === undefined ||
      (Array.isArray(m.tierPosters) && m.tierPosters.every((p) => typeof p === 'string' && POSTER_PATH.test(p)))) &&
    (m.customPoster === undefined || (typeof m.customPoster === 'string' && IMAGE_DATA_URL.test(m.customPoster))) &&
    typeof m.createdAt === 'number' &&
    typeof m.updatedAt === 'number'
  );
}

function validViewing(v: unknown): v is ViewingRecord {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.movieId === 'string' &&
    typeof v.ticketHash === 'string' &&
    v.ticketHash.length >= 8 &&
    typeof v.codeHint === 'string' &&
    optionalString(v.codeFormat) &&
    typeof v.source === 'string' &&
    SOURCES.includes(v.source) &&
    isChainId(v.chain) &&
    typeof v.watchedAt === 'string' &&
    DATE.test(v.watchedAt) &&
    typeof v.registeredAt === 'number' &&
    Number.isInteger(v.serial)
  );
}

export function parseBackup(data: unknown): BackupFile {
  if (!isObject(data) || data.app !== 'cinedex') throw new BackupFormatError('앱 정보 없음');
  if (data.version !== 1) throw new BackupFormatError(`지원하지 않는 버전 ${String(data.version)}`);
  if (!Array.isArray(data.movies) || !Array.isArray(data.viewings)) throw new BackupFormatError('목록 없음');
  const badMovie = data.movies.findIndex((m) => !validMovie(m));
  if (badMovie >= 0) throw new BackupFormatError(`영화 #${badMovie + 1} 형식 오류`);
  const badViewing = data.viewings.findIndex((v) => !validViewing(v));
  if (badViewing >= 0) throw new BackupFormatError(`관람 기록 #${badViewing + 1} 형식 오류`);
  const movieIds = new Set((data.movies as BackupMovie[]).map((m) => m.id));
  const orphan = (data.viewings as ViewingRecord[]).find((v) => !movieIds.has(v.movieId));
  if (orphan) throw new BackupFormatError('영화 정보가 없는 관람 기록');
  return data as unknown as BackupFile;
}

/** 기존 데이터에 합친다. 이미 있는 티켓(같은 해시)은 건너뛴다. */
export async function importBackup(data: unknown): Promise<ImportResult> {
  const backup = parseBackup(data);
  const db = await getDB();
  const tx = db.transaction(['movies', 'viewings', 'meta'], 'readwrite');
  const movies = tx.objectStore('movies');
  const viewings = tx.objectStore('viewings');
  const meta = tx.objectStore('meta');
  let serial = (await meta.get('serial'))?.value ?? 0;
  const result: ImportResult = { movies: 0, viewings: 0, skipped: 0 };

  const wanted = new Set<string>();
  for (const v of backup.viewings) {
    if ((await viewings.index('by-hash').getKey(v.ticketHash)) !== undefined || wanted.has(v.ticketHash)) {
      result.skipped += 1;
      continue;
    }
    wanted.add(v.ticketHash);
  }

  const neededMovies = new Set(backup.viewings.filter((v) => wanted.has(v.ticketHash)).map((v) => v.movieId));
  for (const m of backup.movies) {
    if (!neededMovies.has(m.id)) continue;
    if (!(await movies.getKey(m.id))) {
      const { customPoster, ...rest } = m;
      await movies.put({ ...rest, ...(customPoster ? { customPoster: dataUrlToBlob(customPoster) } : {}) });
      result.movies += 1;
    }
  }

  // 한정 넘버링이 겹치지 않도록 불러온 기록은 현재 번호 뒤로 다시 매긴다. (원래 순서 유지)
  const incoming = backup.viewings.filter((v) => wanted.has(v.ticketHash)).sort((a, b) => a.serial - b.serial);
  for (const v of incoming) {
    serial += 1;
    await viewings.add({ ...v, id: (await viewings.getKey(v.id)) ? `${v.id}-${serial}` : v.id, serial });
    result.viewings += 1;
  }
  await meta.put({ key: 'serial', value: serial });
  await tx.done;
  return result;
}
