/**
 * 데이터 보관 상태.
 *
 * 카드·관람 기록은 이 기기 브라우저의 IndexedDB 에 저장되어 앱을 닫았다 열어도 남는다.
 * 다만 기본(best-effort) 보관이면 기기 저장 공간이 부족할 때 브라우저가 지울 수 있어서,
 * 지킬 데이터가 생기면 영구 보관(navigator.storage.persist)을 요청한다.
 * 허용 여부는 브라우저가 정한다. (크롬: 설치한 앱·자주 쓰는 사이트, 사파리: 홈 화면 앱이면 허용)
 *
 * 아이폰 사파리는 7일 동안 방문하지 않은 사이트의 저장 데이터를 지운다. 홈 화면 앱은 예외지만
 * 사파리와 저장소가 따로라서, 사파리에서 모은 카드는 백업 파일로 옮겨야 한다.
 *
 * 파이어폭스는 영구 보관을 요청하면 허용 창을 띄우므로, 첫 화면에서 묻지 않고 카드를 받은 직후에 요청한다.
 */
import { getDB } from './db';

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

function storageManager(): Partial<Pick<StorageManager, 'persist' | 'persisted'>> | undefined {
  return globalThis.navigator?.storage;
}

export async function getPersistState(): Promise<PersistState> {
  const storage = storageManager();
  if (typeof storage?.persisted !== 'function') return 'unsupported';
  try {
    return (await storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/** 영구 보관 요청. 이미 영구 보관이면 다시 요청하지 않는다. */
export async function requestPersistence(): Promise<PersistState> {
  const storage = storageManager();
  if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

/** 이 사이트가 쓰는 저장 공간(바이트). 알 수 없으면 null */
export async function getUsageBytes(): Promise<number | null> {
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    return typeof estimate?.usage === 'number' ? estimate.usage : null;
  } catch {
    return null;
  }
}

/** 지킬 데이터(관람 기록)가 있을 때만 영구 보관을 요청한다. 앱 시작 시·카드를 받은 직후에 호출 */
export async function ensurePersistence(): Promise<PersistState> {
  const state = await getPersistState();
  if (state !== 'best-effort') return state;
  try {
    const db = await getDB();
    if ((await db.count('viewings')) === 0) return state;
  } catch {
    return state;
  }
  return requestPersistence();
}

/** 홈 화면에 추가한 앱으로 실행 중인지 */
export function isStandalone(): boolean {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || nav?.standalone === true);
}

/** 아이폰·아이패드. iPadOS 13+ 는 데스크톱 사파리처럼 'Macintosh' 로 표시되므로 터치 지원으로 구분 */
export function isIOS(
  ua: string = globalThis.navigator?.userAgent ?? '',
  maxTouchPoints: number = globalThis.navigator?.maxTouchPoints ?? 0,
): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}
