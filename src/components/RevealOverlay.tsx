import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CardModel } from '../lib/cards';
import type { RegisterResult } from '../lib/collection';
import { usePrefersReducedMotion } from '../lib/hooks';
import { nextTierInfo } from '../lib/tiers';
import { Card, CardBack } from './Card';

interface RevealOverlayProps {
  result: RegisterResult;
  card: CardModel;
  onView: () => void;
  onClose: () => void;
}

/** 카드 획득 연출: 뒷면 카드가 떨리다가 탭(또는 잠시 후 자동)하면 뒤집히며 빛이 터진다. */
export function RevealOverlay({ result, card, onView, onClose }: RevealOverlayProps) {
  const reduced = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState(reduced);
  const backRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const { tier, previousTier, tierUp, count } = result;
  const next = nextTierInfo(count);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  useEffect(() => {
    if (flipped) {
      const t = window.setTimeout(() => viewRef.current?.focus({ preventScroll: true }), 60);
      return () => window.clearTimeout(t);
    }
    backRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setFlipped(true), 2800);
    return () => window.clearTimeout(timer);
  }, [flipped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const eyebrow =
    tierUp && previousTier
      ? `${previousTier.name} → ${tier.name} 등급 업!`
      : count === 1
        ? '새 카드 획득!'
        : `${count}회째 관람 기록 완료`;

  return (
    <div
      className={`reveal reveal--${tier.key}${flipped ? ' is-flipped' : ''}${tierUp ? ' is-tier-up' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
      data-testid="reveal"
    >
      <div className="reveal__backdrop" aria-hidden="true" />
      <div className="reveal__stage">
        <div className="reveal__rays" aria-hidden="true" />
        <div className="flip">
          <div className="flip__inner">
            <button
              ref={backRef}
              type="button"
              className="flip__side flip__back"
              onClick={() => setFlipped(true)}
              aria-label="카드 열기"
              disabled={flipped}
            >
              <CardBack />
            </button>
            <div className="flip__side flip__front" aria-hidden={!flipped}>
              <Card card={card} size="lg" tilt={flipped ? 'drag' : false} />
            </div>
          </div>
        </div>
        <div className="reveal__flash" aria-hidden="true" />
        {tierUp && flipped && <Burst />}
      </div>
      <div className="reveal__text" aria-live="polite">
        {flipped ? (
          <>
            <p className="reveal__eyebrow">{eyebrow}</p>
            <h2 id="reveal-title" className="reveal__title">
              {tier.name} <span className="reveal__stars">{tier.stars ? '★'.repeat(tier.stars) : '●'}</span>
            </h2>
            <p className="reveal__movie">{card.title}</p>
            <p className="reveal__next">
              {next ? `${next.next.name}까지 ${next.remaining}회 더!` : '최고 등급 레전드를 달성했어요!'}
            </p>
          </>
        ) : (
          <h2 id="reveal-title" className="reveal__title reveal__title--hint">
            카드를 탭해서 열어 보세요
          </h2>
        )}
      </div>
      <div className="reveal__actions">
        {flipped && (
          <>
            <button ref={viewRef} type="button" className="btn btn--primary" onClick={onView}>
              카드 보기
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              다른 티켓 스캔
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Burst() {
  return (
    <div className="reveal__burst" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  );
}
