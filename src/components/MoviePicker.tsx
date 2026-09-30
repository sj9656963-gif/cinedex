import { useEffect, useState } from 'react';
import type { MovieSummary } from '../lib/collection';
import { describePick, type MoviePick } from '../lib/pick';
import { useSettings } from '../lib/settings';
import { nowPlaying, releaseYear, searchMovies, type TmdbMovie } from '../lib/tmdb';
import { IconSearch } from './Icons';
import { MovieThumb } from './MovieThumb';

interface MoviePickerProps {
  value: MoviePick | null;
  onChange: (pick: MoviePick | null) => void;
  collection: readonly MovieSummary[];
}

/** 현재 상영작은 자주 바뀌지 않으니 세션 동안 10분 캐시 */
let nowPlayingCache: { token: string; at: number; list: TmdbMovie[] } | null = null;

async function nowPlayingCached(token: string, signal: AbortSignal): Promise<TmdbMovie[]> {
  if (nowPlayingCache && nowPlayingCache.token === token && Date.now() - nowPlayingCache.at < 10 * 60_000) {
    return nowPlayingCache.list;
  }
  const list = await nowPlaying(token, signal);
  nowPlayingCache = { token, at: Date.now(), list };
  return list;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function MoviePicker({ value, onChange, collection }: MoviePickerProps) {
  const { tmdbToken } = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMovie[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const trimmed = query.trim();

  useEffect(() => {
    if (!tmdbToken || value) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setStatus('loading');
        try {
          const list = trimmed
            ? await searchMovies(trimmed, tmdbToken, controller.signal)
            : await nowPlayingCached(tmdbToken, controller.signal);
          setResults(list.slice(0, 12));
          setStatus('done');
        } catch (e) {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      },
      trimmed ? 350 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, tmdbToken, value]);

  if (value) {
    const info = describePick(value);
    return (
      <div className="selected-movie" data-testid="selected-movie">
        <MovieThumb title={info.title} posterPath={info.posterPath} customPoster={info.customPoster} large />
        <div className="selected-movie__text">
          <strong>{info.title}</strong>
          <span className="muted">{info.sub}</span>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(null)}>
          변경
        </button>
      </div>
    );
  }

  const lower = trimmed.toLowerCase();
  const mine = (trimmed ? collection.filter((s) => s.movie.title.toLowerCase().includes(lower)) : collection).slice(0, 8);

  return (
    <div className="picker">
      <div className="search">
        <IconSearch />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tmdbToken ? '영화 제목으로 검색' : '영화 제목 입력'}
          aria-label="영화 제목"
          enterKeyHint="search"
          autoComplete="off"
          onKeyDown={(e) => {
            // 검색창에서 엔터를 눌러도 폼이 제출되지 않게
            if (e.key === 'Enter') e.preventDefault();
          }}
        />
      </div>

      {mine.length > 0 && (
        <section className="picker__group" aria-label="내 도감에 있는 영화">
          <h3 className="picker__heading">
            내 도감의 영화 <span className="muted">· 다시 봤다면 여기서 골라 주세요</span>
          </h3>
          <ul className="picker__list">
            {mine.map((s) => (
              <li key={s.movie.id}>
                <button
                  type="button"
                  className="movie-option"
                  onClick={() => onChange({ kind: 'existing', movie: s.movie, count: s.count })}
                >
                  <MovieThumb title={s.movie.title} posterPath={s.movie.posterPath} customPoster={s.movie.customPoster} />
                  <span className="movie-option__text">
                    <span className="movie-option__title">{s.movie.title}</span>
                    <span className="movie-option__sub">
                      {s.count}회 관람 · {s.tier.name}
                    </span>
                  </span>
                  <span className="movie-option__badge">+1회</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tmdbToken ? (
        <section className="picker__group" aria-label={trimmed ? '검색 결과' : '지금 상영 중'} aria-busy={status === 'loading'}>
          <h3 className="picker__heading">{trimmed ? '검색 결과' : '지금 상영 중'}</h3>
          {status === 'loading' && results.length === 0 && <p className="muted small">불러오는 중…</p>}
          {status === 'error' && <p className="error-text small">{error}</p>}
          {status === 'done' && results.length === 0 && <p className="muted small">검색 결과가 없어요. 아래에서 직접 추가할 수 있어요.</p>}
          <ul className="picker__list">
            {results.map((m) => {
              const sub = [releaseYear(m), m.original_title !== m.title ? m.original_title : null].filter(Boolean).join(' · ');
              return (
                <li key={m.id}>
                  <button type="button" className="movie-option" onClick={() => onChange({ kind: 'tmdb', movie: m })}>
                    <MovieThumb title={m.title} posterPath={m.poster_path ?? undefined} />
                    <span className="movie-option__text">
                      <span className="movie-option__title">{m.title}</span>
                      {sub && <span className="movie-option__sub">{sub}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="picker__hint small">
          <a href="#/settings">설정</a>에서 TMDB 토큰을 넣으면 영화 검색과 공식 포스터를 쓸 수 있어요. 지금은 제목을 직접 입력해 주세요.
        </p>
      )}

      {trimmed && (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => onChange({ kind: 'manual', title: trimmed })}>
          ‘{trimmed}’ 제목으로 직접 추가
        </button>
      )}
    </div>
  );
}
