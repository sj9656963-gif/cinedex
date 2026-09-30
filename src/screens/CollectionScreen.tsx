import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { cardFromSummary, sampleCard } from '../lib/cards';
import type { MovieSummary } from '../lib/collection';
import { useCollection } from '../lib/hooks';
import { href } from '../lib/router';
import { MAX_TIER, TIERS } from '../lib/tiers';

type SortKey = 'recent' | 'count' | 'title';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: '최근 관람' },
  { key: 'count', label: '많이 본 순' },
  { key: 'title', label: '제목순' },
];

function sortItems(items: readonly MovieSummary[], key: SortKey): MovieSummary[] {
  const list = [...items];
  if (key === 'count') list.sort((a, b) => b.count - a.count || b.lastSerial - a.lastSerial);
  if (key === 'title') list.sort((a, b) => a.movie.title.localeCompare(b.movie.title, 'ko'));
  return list;
}

export function CollectionScreen() {
  const { items, loading, error } = useCollection();
  const [sort, setSort] = useState<SortKey>('recent');
  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
  const totalViews = items.reduce((sum, s) => sum + s.count, 0);
  const best = items.reduce((top, s) => (s.tier.level > top ? s.tier.level : top), 0);

  return (
    <div className="screen collection">
      <header className="screen-header">
        <p className="eyebrow">CINEDEX</p>
        <h1>내 영화 카드 도감</h1>
      </header>

      {error && <p className="error-text">도감을 불러오지 못했어요: {error}</p>}
      {!loading && !error && items.length === 0 && <EmptyState />}

      {items.length > 0 && (
        <>
          <dl className="stats">
            <div>
              <dt>모은 영화</dt>
              <dd>{items.length}편</dd>
            </div>
            <div>
              <dt>총 관람</dt>
              <dd>{totalViews}회</dd>
            </div>
            <div>
              <dt>최고 등급</dt>
              <dd className={`stats__tier tier-text-${TIERS[best - 1]?.key ?? 'normal'}`}>{TIERS[best - 1]?.name ?? '-'}</dd>
            </div>
          </dl>

          <div className="sortbar" role="group" aria-label="정렬">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="pill"
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <ul className="card-grid">
            {sorted.map((summary) => (
              <li key={summary.movie.id}>
                <a
                  className="card-link"
                  href={href({ name: 'movie', id: summary.movie.id })}
                  aria-label={`${summary.movie.title} · ${summary.tier.name} · ${summary.count}회 관람`}
                >
                  <Card card={cardFromSummary(summary, undefined, 'w342')} size="sm" tilt="hover" calm />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="empty">
      <div className="empty__card">
        <Card card={sampleCard(MAX_TIER, '당신의 인생 영화')} size="lg" tilt="hover" />
      </div>
      <h2>아직 모은 카드가 없어요</h2>
      <p className="muted">
        영화 티켓의 QR코드나 바코드를 스캔하면 그 영화의 포스터 카드를 받아요. 같은 영화를 여러 번 볼수록 카드가 점점 더 희귀하고
        화려해져요.
      </p>
      <ol className="ladder" aria-label="등급 단계">
        {TIERS.map((t) => (
          <li key={t.key} className={`ladder__step tier-text-${t.key}`}>
            <span className="ladder__count">{t.minViews}회</span>
            <span className="ladder__name">{t.name}</span>
          </li>
        ))}
      </ol>
      <a className="btn btn--primary btn--lg" href={href({ name: 'scan' })}>
        첫 티켓 스캔하기
      </a>
    </section>
  );
}
