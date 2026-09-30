import { Card } from '../components/Card';
import { IconCrown } from '../components/Icons';
import { sampleCard } from '../lib/cards';
import { TIERS } from '../lib/tiers';

export function TiersScreen() {
  return (
    <div className="screen tiers">
      <header className="screen-header">
        <p className="eyebrow">RARITY</p>
        <h1>카드 등급 안내</h1>
        <p className="screen-header__desc">
          같은 영화를 볼 때마다 티켓을 스캔하세요. 누적 관람 횟수에 따라 더 희귀하고 화려한 카드가 열리고, 등급마다 다른 한정 포스터가
          들어가요.
        </p>
      </header>

      <ol className="tier-list">
        {TIERS.map((t) => (
          <li key={t.key} className="tier-row">
            <div className="tier-row__card">
              <Card card={sampleCard(t)} size="sm" tilt="hover" calm />
            </div>
            <div className="tier-row__text">
              <p className={`tier-row__req tier-text-${t.key}`}>{t.minViews}회 관람</p>
              <h2 className="tier-row__name">
                {t.name} <span className="tier-row__label">{t.label}</span>
              </h2>
              <p className="tier-row__stars" aria-label={t.stars ? `별 ${t.stars}개` : '별 없음'}>
                {t.stars ? '★'.repeat(t.stars) : '●'}
              </p>
              <p className="muted small">{t.effect}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="panel section">
        <h2 className="section__title crown-title">
          <IconCrown /> 3사 정복
        </h2>
        <p className="muted small">
          한 영화를 CGV · 롯데시네마 · 메가박스에서 모두 보면 카드에 왕관 표시가 붙어요.
        </p>
      </section>

      <section className="panel section">
        <h2 className="section__title">한정 넘버</h2>
        <p className="muted small">
          카드 아래의 No.0000 은 그 등급을 해금한 티켓의 등록 순번이에요. 같은 영화, 같은 등급이라도 사람마다 번호가 달라요.
        </p>
      </section>
    </div>
  );
}
