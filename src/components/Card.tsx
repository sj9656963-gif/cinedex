import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { CardModel } from '../lib/cards';
import { CHAINS, CHAIN_IDS } from '../lib/chains';
import { useObjectUrl } from '../lib/hooks';
import type { TierDef } from '../lib/tiers';
import { clamp, hashString, padSerial } from '../lib/util';
import { IconCrown, IconLock } from './Icons';

export type CardSize = 'sm' | 'lg';

interface CardProps {
  card: CardModel;
  size?: CardSize;
  /** 'hover' = 마우스·펜으로 기울이기, 'drag' = 터치 드래그까지 (페이지 스크롤 대신 카드가 움직임) */
  tilt?: 'hover' | 'drag' | false;
  /** 휴대폰 기울기 센서로 반짝임 움직이기 */
  gyro?: boolean;
  /** 목록용: 반복 애니메이션을 줄여 가볍게 */
  calm?: boolean;
  className?: string;
}

const HOLO_VARS = [
  '--pointer-x',
  '--pointer-y',
  '--pointer-from-center',
  '--rotate-x',
  '--rotate-y',
  '--background-x',
  '--background-y',
] as const;

/** 포인터/기울기 → CSS 변수. React 렌더 없이 style 만 직접 갱신한다. */
function useHolo(ref: RefObject<HTMLDivElement | null>, tilt: CardProps['tilt'], gyro: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || (!tilt && !gyro)) return;

    let frame = 0;
    let target: { x: number; y: number } | null = null;
    let gyroActive = false;
    let baseBeta: number | null = null;

    const render = () => {
      frame = 0;
      if (!target) return;
      const { x, y } = target;
      const dx = x - 0.5;
      const dy = y - 0.5;
      const s = el.style;
      s.setProperty('--pointer-x', `${(x * 100).toFixed(2)}%`);
      s.setProperty('--pointer-y', `${(y * 100).toFixed(2)}%`);
      s.setProperty('--pointer-from-center', clamp(Math.hypot(dx, dy) * 2, 0, 1).toFixed(3));
      s.setProperty('--rotate-x', `${(dx * 32).toFixed(2)}deg`);
      s.setProperty('--rotate-y', `${(-dy * 32).toFixed(2)}deg`);
      s.setProperty('--background-x', `${(37 + x * 26).toFixed(2)}%`);
      s.setProperty('--background-y', `${(33 + y * 34).toFixed(2)}%`);
    };

    const set = (x: number, y: number) => {
      target = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
      el.classList.add('is-active');
      if (!frame) frame = requestAnimationFrame(render);
    };

    const reset = () => {
      target = null;
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove('is-active');
      for (const name of HOLO_VARS) el.style.removeProperty(name);
    };

    const onPointer = (e: PointerEvent) => {
      if (!tilt || (tilt === 'hover' && e.pointerType === 'touch')) return;
      const rect = el.getBoundingClientRect();
      set((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.type === 'pointerup' && e.pointerType !== 'touch') return;
      if (!gyroActive) reset();
    };

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      gyroActive = true;
      baseBeta ??= e.beta;
      set(0.5 + e.gamma / 45, 0.5 + (e.beta - baseBeta) / 45);
    };

    el.addEventListener('pointermove', onPointer);
    el.addEventListener('pointerdown', onPointer);
    el.addEventListener('pointerleave', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('pointerup', onPointerEnd);
    if (gyro) window.addEventListener('deviceorientation', onOrientation);

    return () => {
      el.removeEventListener('pointermove', onPointer);
      el.removeEventListener('pointerdown', onPointer);
      el.removeEventListener('pointerleave', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('deviceorientation', onOrientation);
      reset();
    };
  }, [ref, tilt, gyro]);
}

export function Card({ card, size = 'lg', tilt = false, gyro = false, calm = false, className }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  useHolo(ref, tilt, gyro);
  const customUrl = useObjectUrl(card.customPoster);
  const { tier } = card;
  const src = customUrl ?? card.posterSrc;
  const chains = CHAIN_IDS.filter((id) => (card.chains[id] ?? 0) > 0);
  const sub = [card.subtitle, card.year].filter(Boolean).join(' · ');

  const classes = [
    'card',
    `card--${size}`,
    `tier-${tier.key}`,
    tier.fullArt ? 'card--full' : 'card--framed',
    calm && 'card--calm',
    tilt === 'drag' && 'card--drag',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const label = `${card.title} · ${tier.name} 카드 · 관람 ${card.count}회${card.serial ? ` · No.${padSerial(card.serial)}` : ''}${
    card.tripleCrown ? ' · 3사 정복' : ''
  }`;

  return (
    <div ref={ref} className={classes} role="img" aria-label={label} data-tier={tier.key}>
      {tier.level >= 5 && <div className="card__aura" aria-hidden="true" />}
      <div className="card__rotator">
        <div className="card__face">
          <div className="card__art">
            <Poster src={src} title={card.title} year={card.year} />
            {tier.key === 'holo' && <div className="card__art-foil" />}
          </div>
          {tier.level >= 2 && <div className="card__shine" />}
          {tier.level >= 4 && <div className="card__sparkle" />}
          <div className="card__edge" />
          <div className="card__header">
            <span className="card__title">{card.title}</span>
            <span className="card__rarity">{tier.label}</span>
          </div>
          <div className="card__footer">
            <div className="card__line">
              <span className="card__sub">{sub}</span>
              <span className="card__stars" aria-hidden="true">
                {card.tripleCrown && <IconCrown className="card__crown" />}
                {tier.stars > 0 ? '★'.repeat(tier.stars) : '●'}
              </span>
            </div>
            <div className="card__line card__meta">
              <span className="card__chips">
                {chains.map((id) => (
                  <span key={id} className="chip" style={{ '--chain-color': CHAINS[id].color } as CSSProperties}>
                    {CHAINS[id].short}
                  </span>
                ))}
              </span>
              <span className="card__count">관람 {card.count}회</span>
              {card.serial !== undefined && <span className="card__serial">No.{padSerial(card.serial)}</span>}
            </div>
          </div>
          <div className="card__glare" />
        </div>
      </div>
      {tier.key === 'legend' && <Particles />}
    </div>
  );
}

function Poster({ src, title, year }: { src?: string; title: string; year?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <GeneratedArt title={title} year={year} />;
  return (
    <img
      className="card__img"
      src={src}
      alt=""
      // TMDB 이미지는 CORS 를 허용해서, 서비스 워커가 오프라인용으로 캐시할 수 있다.
      crossOrigin={src.startsWith('http') ? 'anonymous' : undefined}
      decoding="async"
      loading="lazy"
      draggable={false}
      onError={() => setFailedSrc(src)}
    />
  );
}

/** 포스터가 없을 때(직접 입력한 영화, 오프라인) 제목으로 만드는 포스터 그림 */
export function GeneratedArt({ title, year }: { title: string; year?: string }) {
  const hue = hashString(title) % 360;
  const style = { '--h': hue, '--h2': (hue + 55) % 360 } as CSSProperties;
  return (
    <div className="gen-art" style={style} aria-hidden="true">
      <div className="gen-art__rays" />
      <div className="gen-art__orb" />
      <div className="gen-art__strip gen-art__strip--top" />
      <div className="gen-art__body">
        <span className="gen-art__kicker">NOW SHOWING</span>
        <span className="gen-art__title">{title}</span>
        {year && <span className="gen-art__year">{year}</span>}
      </div>
      <div className="gen-art__strip gen-art__strip--bottom" />
    </div>
  );
}

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 41 + 7) % 100,
  delay: ((i * 0.61) % 3.6).toFixed(2),
  size: (0.7 + ((i * 7) % 6) / 10).toFixed(2),
  drift: (((i * 13) % 9) - 4) * 1.5,
}));

function Particles() {
  return (
    <div className="card__particles" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          style={{ '--x': p.x, '--delay': p.delay, '--size': p.size, '--drift': p.drift } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** 아직 해금하지 않은 등급 */
export function LockedCard({ tier, remaining }: { tier: TierDef; remaining: number }) {
  return (
    <div
      className={`card card--sm card--locked locked-${tier.key}`}
      role="img"
      aria-label={`${tier.name} 카드 잠김 · ${remaining}회 더 보면 해금`}
    >
      <div className="card__rotator">
        <div className="card__face card__face--locked">
          <IconLock className="locked__icon" />
          <span className="locked__name">{tier.name}</span>
          <span className="locked__req">{tier.minViews}회 관람</span>
        </div>
      </div>
    </div>
  );
}

/** 카드 뒷면 (획득 연출용) */
export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <div className="card-back__pattern" />
      <div className="card-back__emblem">
        <span className="card-back__star">★</span>
        <span className="card-back__name">CINEDEX</span>
        <span className="card-back__tag">MOVIE CARD</span>
      </div>
    </div>
  );
}
