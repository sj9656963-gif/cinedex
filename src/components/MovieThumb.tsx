import { useState, type CSSProperties } from 'react';
import { useObjectUrl } from '../lib/hooks';
import { posterUrl } from '../lib/tmdb';
import { hashString } from '../lib/util';

interface MovieThumbProps {
  title: string;
  posterPath?: string;
  customPoster?: Blob;
  large?: boolean;
}

/** 목록용 작은 포스터. 이미지가 없으면 제목 첫 글자 */
export function MovieThumb({ title, posterPath, customPoster, large = false }: MovieThumbProps) {
  const customUrl = useObjectUrl(customPoster);
  const [failed, setFailed] = useState<string | null>(null);
  const src = customUrl ?? (posterPath ? posterUrl(posterPath, large ? 'w185' : 'w92') : undefined);
  const style = { '--h': hashString(title) % 360 } as CSSProperties;
  return (
    <span className={`thumb${large ? ' thumb--lg' : ''}`} style={style} aria-hidden="true">
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          crossOrigin={customUrl ? undefined : 'anonymous'}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="thumb__letter">{Array.from(title.trim())[0] ?? '?'}</span>
      )}
    </span>
  );
}
