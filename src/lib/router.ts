import { useSyncExternalStore } from 'react';

/** 해시 기반 라우팅 — 정적 호스팅/PWA 에서 새로고침해도 안전하다. */
export type Route =
  | { name: 'collection' }
  | { name: 'scan' }
  | { name: 'movie'; id: string }
  | { name: 'tiers' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const [, first = '', second] = path.split('/');
  switch (first) {
    case 'scan':
      return { name: 'scan' };
    case 'tiers':
      return { name: 'tiers' };
    case 'settings':
      return { name: 'settings' };
    case 'movie':
      if (second) {
        try {
          return { name: 'movie', id: decodeURIComponent(second) };
        } catch {
          return { name: 'collection' };
        }
      }
      return { name: 'collection' };
    default:
      return { name: 'collection' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'collection':
      return '#/';
    case 'movie':
      return `#/movie/${encodeURIComponent(route.id)}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

const getHash = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  return parseHash(hash);
}
