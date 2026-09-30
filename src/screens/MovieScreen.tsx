import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, LockedCard } from '../components/Card';
import { useConfirm } from '../components/ConfirmDialog';
import { IconBack, IconCrown, IconImage, IconTilt, IconTrash } from '../components/Icons';
import { cardFromSummary } from '../lib/cards';
import { CHAINS, MAJOR_CHAINS, type ChainId } from '../lib/chains';
import { deleteViewing, isTripleCrown, setCustomPoster, unlockingViewing } from '../lib/collection';
import { SOURCE_LABELS } from '../lib/format';
import { notifyCollectionChanged, useMovieSummary } from '../lib/hooks';
import { resizeImage } from '../lib/image';
import { href, navigate } from '../lib/router';
import { updateSettings, useSettings } from '../lib/settings';
import { getTier, nextTierInfo, TIERS, type TierLevel } from '../lib/tiers';
import { showToast } from '../lib/toast';
import { formatDate, padSerial } from '../lib/util';

type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

function orientationApi(): OrientationEventWithPermission | undefined {
  return typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as OrientationEventWithPermission);
}

/** 터치 위주 기기(휴대폰·태블릿)인지 */
function useCoarsePointer(): boolean {
  const [coarse] = useState(() => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false);
  return coarse;
}

export function MovieScreen({ id }: { id: string }) {
  const { summary, loading, error } = useMovieSummary(id);
  const settings = useSettings();
  const coarse = useCoarsePointer();
  const [level, setLevel] = useState<TierLevel | null>(null);
  // iOS 는 기울기 센서를 쓰려면 사용자 동작으로 권한을 받아야 한다.
  const [gyroAllowed, setGyroAllowed] = useState(() => typeof orientationApi()?.requestPermission !== 'function');
  const [dialog, confirm] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLevel(null), [id]);

  if (loading && !summary) return <div className="screen" aria-busy="true" />;
  if (error || !summary) {
    return (
      <div className="screen">
        <div className="panel notice">
          <h1>카드를 찾을 수 없어요</h1>
          <p className="muted">삭제되었거나 다른 기기에서 만든 카드일 수 있어요.</p>
          <a className="btn btn--primary" href={href({ name: 'collection' })}>
            도감으로
          </a>
        </div>
      </div>
    );
  }

  const top = summary.tier.level;
  const shown = level && level <= top ? level : top;
  const card = cardFromSummary(summary, shown, 'w780');
  const shownTier = getTier(shown);
  const unlock = unlockingViewing(summary, shownTier);
  const next = nextTierInfo(summary.count);
  const crown = isTripleCrown(summary.chains);
  const missingChains = MAJOR_CHAINS.filter((c) => summary.chains[c] === 0);
  const chainRows: ChainId[] = summary.chains.OTHER > 0 ? [...MAJOR_CHAINS, 'OTHER'] : [...MAJOR_CHAINS];
  const hasOrientation = coarse && orientationApi() !== undefined;
  const gyroOn = hasOrientation && settings.tilt && gyroAllowed;

  const toggleGyro = async () => {
    if (gyroOn) {
      updateSettings({ tilt: false });
      return;
    }
    const api = orientationApi();
    if (typeof api?.requestPermission === 'function') {
      try {
        const result = await api.requestPermission();
        if (result !== 'granted') {
          showToast('기울기 센서 권한이 없어서 켤 수 없어요.', 'error');
          return;
        }
        setGyroAllowed(true);
      } catch {
        showToast('기울기 센서를 켤 수 없어요.', 'error');
        return;
      }
    }
    updateSettings({ tilt: true });
  };

  const removeViewing = async (viewingId: string, nth: number) => {
    const last = summary.count === 1;
    const ok = await confirm({
      title: `${nth}번째 관람 기록을 삭제할까요?`,
      message: last
        ? '마지막 기록이라 이 영화 카드가 도감에서 사라져요.'
        : '관람 횟수가 줄어서 카드 등급이 내려갈 수 있어요. 삭제한 티켓은 다시 스캔해서 등록할 수 있어요.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    const { movieDeleted } = await deleteViewing(viewingId);
    notifyCollectionChanged();
    setLevel(null);
    if (movieDeleted) {
      showToast('카드를 도감에서 삭제했어요.');
      navigate({ name: 'collection' });
    } else {
      showToast('관람 기록을 삭제했어요.');
    }
  };

  const changePoster = async (file: File | undefined) => {
    if (!file) return;
    try {
      await setCustomPoster(summary.movie.id, await resizeImage(file));
      notifyCollectionChanged();
      showToast('포스터 사진을 바꿨어요.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '사진을 저장하지 못했어요.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetPoster = async () => {
    await setCustomPoster(summary.movie.id, undefined);
    notifyCollectionChanged();
    showToast('기본 포스터로 되돌렸어요.');
  };

  const overall = next ? summary.count / next.next.minViews : 1;

  return (
    <div className="screen movie">
      <header className="topbar">
        <a className="icon-btn" href={href({ name: 'collection' })} aria-label="도감으로 돌아가기">
          <IconBack />
        </a>
        <div className="topbar__title">
          <h1>{summary.movie.title}</h1>
          {(summary.movie.originalTitle || summary.movie.year) && (
            <p className="muted small">{[summary.movie.originalTitle, summary.movie.year].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      </header>

      <section className="movie__hero" aria-label="카드">
        <div className="movie__card">
          <Card card={card} size="lg" tilt="drag" gyro={gyroOn} />
        </div>
        <p className="movie__unlock small muted">
          {shownTier.name} 해금 · {unlock ? `${formatDate(unlock.watchedAt)} · ${CHAINS[unlock.chain].name} · No.${padSerial(unlock.serial)}` : '-'}
        </p>
        {hasOrientation && (
          <button type="button" className="pill" aria-pressed={gyroOn} onClick={() => void toggleGyro()}>
            <IconTilt /> 기울여서 보기 {gyroOn ? '켜짐' : '꺼짐'}
          </button>
        )}
      </section>

      <section className="panel progress-block" aria-label="등급 진행">
        <div className="progress-block__labels">
          <span className={`tier-text-${summary.tier.key}`}>
            {summary.tier.name} · 관람 {summary.count}회
          </span>
          <span>{next ? `${next.next.name}까지 ${next.remaining}회` : '최고 등급 달성'}</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label={next ? `${next.next.name}까지 진행률` : '최고 등급 달성'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall * 100)}
        >
          <span style={{ width: `${Math.max(4, overall * 100)}%` }} />
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">등급별 카드</h2>
        <p className="muted small">해금한 카드를 눌러 크게 볼 수 있어요.</p>
        <ul className="tier-strip">
          {TIERS.map((t) =>
            t.level <= top ? (
              <li key={t.key}>
                <button
                  type="button"
                  className="tier-thumb"
                  aria-pressed={shown === t.level}
                  aria-label={`${t.name} 카드 크게 보기`}
                  onClick={() => setLevel(t.level)}
                >
                  <Card card={cardFromSummary(summary, t.level, 'w185')} size="sm" calm />
                </button>
              </li>
            ) : (
              <li key={t.key}>
                <LockedCard tier={t} remaining={t.minViews - summary.count} />
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="section panel">
        <h2 className="section__title">극장별 관람</h2>
        <div className="chain-stats">
          {chainRows.map((c) => (
            <div
              key={c}
              className={`chain-stat${summary.chains[c] ? '' : ' is-empty'}`}
              style={{ '--chain-color': CHAINS[c].color } as CSSProperties}
            >
              <span className="chain-stat__name">{CHAINS[c].name}</span>
              <span className="chain-stat__count">{summary.chains[c]}회</span>
            </div>
          ))}
        </div>
        <p className={`crown-line small${crown ? ' is-done' : ''}`}>
          <IconCrown />
          {crown
            ? '3사 정복! CGV·롯데시네마·메가박스에서 모두 봤어요.'
            : `3사 정복까지: ${missingChains.map((c) => CHAINS[c].name).join(', ')}에서 한 번씩 더`}
        </p>
        <p className="muted small">
          처음 본 날 {formatDate(summary.firstWatchedAt)} · 마지막 {formatDate(summary.lastWatchedAt)}
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">관람 기록 {summary.count}회</h2>
        <ol className="viewings">
          {[...summary.viewings].reverse().map((v) => {
            const nth = summary.viewings.indexOf(v) + 1;
            const unlocked = TIERS.find((t) => t.minViews === nth);
            return (
              <li key={v.id} className="viewing">
                <span className="viewing__nth" aria-hidden="true">
                  {nth}
                </span>
                <div className="viewing__body">
                  <div className="viewing__top">
                    <span className="sr-only">{nth}번째 관람, </span>
                    <span>{formatDate(v.watchedAt)}</span>
                    <span className="chip" style={{ '--chain-color': CHAINS[v.chain].color } as CSSProperties}>
                      {CHAINS[v.chain].name}
                    </span>
                    {unlocked && <span className={`viewing__unlock tier-text-${unlocked.key}`}>{unlocked.name} 해금</span>}
                  </div>
                  <div className="viewing__sub muted small">
                    티켓 {v.codeHint} · {SOURCE_LABELS[v.source]} · No.{padSerial(v.serial)}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`${nth}번째 관람 기록 삭제`}
                  onClick={() => void removeViewing(v.id, nth)}
                >
                  <IconTrash />
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section panel">
        <h2 className="section__title">포스터</h2>
        <p className="muted small">
          {summary.movie.customPoster
            ? '직접 올린 사진을 카드 포스터로 쓰고 있어요.'
            : summary.movie.tmdbId
              ? 'TMDB 공식 포스터를 등급마다 다르게 쓰고 있어요. 원하는 사진으로 바꿀 수도 있어요.'
              : '포스터 그림이 제목으로 자동 생성돼 있어요. 직접 찍은 포스터 사진으로 바꿀 수 있어요.'}
        </p>
        <div className="actions">
          <label className="btn btn--ghost">
            <IconImage /> 포스터 사진 바꾸기
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void changePoster(e.target.files?.[0])}
            />
          </label>
          {summary.movie.customPoster && (
            <button type="button" className="btn btn--ghost" onClick={() => void resetPoster()}>
              기본 포스터로
            </button>
          )}
        </div>
      </section>
      {dialog}
    </div>
  );
}
