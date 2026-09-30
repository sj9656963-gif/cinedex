import { useSyncExternalStore } from 'react';
import { isChainId, type ChainId } from './chains';

export interface Settings {
  /** TMDB API 읽기 액세스 토큰(v4) 또는 API 키(v3). 이 기기의 localStorage 에만 저장 */
  tmdbToken: string;
  /** 카드 상세에서 휴대폰 기울기(자이로)로 홀로 효과 움직이기 */
  tilt: boolean;
  /** 마지막으로 고른 극장 (다음 등록 때 기본값) */
  lastChain: ChainId | '';
}

const STORAGE_KEY = 'cinedex.settings.v1';
const DEFAULTS: Settings = { tmdbToken: '', tilt: true, lastChain: '' };

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    const raw = parsed as Partial<Record<keyof Settings, unknown>>;
    return {
      tmdbToken: typeof raw.tmdbToken === 'string' ? raw.tmdbToken : DEFAULTS.tmdbToken,
      tilt: typeof raw.tilt === 'boolean' ? raw.tilt : DEFAULTS.tilt,
      lastChain: isChainId(raw.lastChain) ? raw.lastChain : '',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return (cache ??= load());
}

export function updateSettings(patch: Partial<Settings>): void {
  cache = { ...getSettings(), ...patch };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // 사파리 개인정보 보호 모드 등 저장 불가 환경: 이번 세션 동안만 유지
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
