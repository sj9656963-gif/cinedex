import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChainId } from './chains';
import type { ScanSource } from './ticket';

export interface MovieRecord {
  /** 'tmdb:<id>' 또는 'local:<정규화 제목>' */
  id: string;
  title: string;
  originalTitle?: string;
  year?: string;
  tmdbId?: number;
  /** TMDB 대표 포스터 경로 (예: /abc.jpg) */
  posterPath?: string;
  /** 등급별 포스터 경로 (index 0 = 노멀 … 5 = 레전드) */
  tierPosters?: string[];
  /** 사용자가 올린 포스터 사진 (있으면 TMDB 포스터보다 우선) */
  customPoster?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface ViewingRecord {
  id: string;
  movieId: string;
  /** 정규화한 티켓 코드의 해시 — unique index 로 중복 등록 차단 */
  ticketHash: string;
  codeHint: string;
  codeFormat?: string;
  source: ScanSource;
  chain: ChainId;
  /** 관람일 YYYY-MM-DD */
  watchedAt: string;
  registeredAt: number;
  /** 전체 등록 순번 (카드의 한정 넘버링) */
  serial: number;
}

export interface MetaRecord {
  key: string;
  value: number;
}

export interface CineDexSchema extends DBSchema {
  movies: { key: string; value: MovieRecord };
  viewings: {
    key: string;
    value: ViewingRecord;
    indexes: { 'by-movie': string; 'by-hash': string };
  };
  meta: { key: string; value: MetaRecord };
}

export const DB_NAME = 'cinedex';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CineDexSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<CineDexSchema>> {
  dbPromise ??= openDB<CineDexSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('movies', { keyPath: 'id' });
        const viewings = db.createObjectStore('viewings', { keyPath: 'id' });
        viewings.createIndex('by-movie', 'movieId');
        viewings.createIndex('by-hash', 'ticketHash', { unique: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
    blocking() {
      // 다른 탭에서 새 버전 DB 를 열려고 하면 연결을 닫아 업그레이드를 막지 않는다.
      void closeDB();
    },
  });
  return dbPromise;
}

export async function closeDB(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  (await pending).close();
}
