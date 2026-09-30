import { useEffect, useState } from 'react';
import { getCollection, getMovieSummary, type MovieSummary } from './collection';

/** 등록/삭제/복원 후 화면들이 다시 읽도록 알리는 간단한 이벤트 */
const listeners = new Set<() => void>();

export function notifyCollectionChanged(): void {
  listeners.forEach((listener) => listener());
}

function useReloadable<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    const load = () => {
      loader()
        .then((data) => alive && setState({ data, loading: false, error: null }))
        .catch((error: unknown) =>
          alive && setState({ data: null, loading: false, error: error instanceof Error ? error.message : String(error) }),
        );
    };
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
    // loader 는 deps 가 바뀔 때만 새로 만든다.
  }, deps);

  return state;
}

export function useCollection() {
  const state = useReloadable(getCollection, []);
  return { items: state.data ?? [], loading: state.loading, error: state.error };
}

export function useMovieSummary(movieId: string) {
  const state = useReloadable<MovieSummary | null>(() => getMovieSummary(movieId), [movieId]);
  return { summary: state.data, loading: state.loading, error: state.error };
}

/** Blob → object URL (컴포넌트가 사라지면 해제) */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mql = globalThis.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
