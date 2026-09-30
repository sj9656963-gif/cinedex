import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CameraView } from '../components/CameraView';
import { IconImage, IconKeyboard } from '../components/Icons';
import { MoviePicker } from '../components/MoviePicker';
import { RevealOverlay } from '../components/RevealOverlay';
import { cardFromSummary, type CardModel } from '../lib/cards';
import { CHAIN_IDS, CHAINS, detectChain, type ChainId } from '../lib/chains';
import {
  DuplicateTicketError,
  findTicket,
  getMovieSummary,
  registerViewing,
  type RegisterResult,
} from '../lib/collection';
import type { MovieRecord, ViewingRecord } from '../lib/db';
import { formatLabel } from '../lib/format';
import { notifyCollectionChanged, useCollection } from '../lib/hooks';
import { resolveMovieInput, type MoviePick } from '../lib/pick';
import { href, navigate } from '../lib/router';
import { getSettings, updateSettings } from '../lib/settings';
import { ensurePersistence } from '../lib/storage';
import {
  isPlausibleTicketCode,
  MIN_CODE_LENGTH,
  normalizeTicketCode,
  toScannedTicket,
  type ScannedTicket,
  type ScanSource,
} from '../lib/ticket';
import { showToast } from '../lib/toast';
import { formatDate, todayLocal } from '../lib/util';

type Step =
  | { kind: 'capture' }
  | { kind: 'details'; ticket: ScannedTicket; detectedChain: ChainId | null }
  | { kind: 'duplicate'; viewing: ViewingRecord; movie?: MovieRecord }
  | { kind: 'reveal'; result: RegisterResult; card: CardModel };

type CodeHandler = (raw: string, source: ScanSource, format?: string) => Promise<boolean>;

export function ScanScreen() {
  const [step, setStep] = useState<Step>({ kind: 'capture' });
  const busyRef = useRef(false);
  const restart = useCallback(() => setStep({ kind: 'capture' }), []);

  const handleCode = useCallback<CodeHandler>(async (raw, source, format) => {
    if (busyRef.current) return false;
    const normalized = normalizeTicketCode(raw);
    if (!isPlausibleTicketCode(normalized)) {
      showToast(`티켓 코드가 너무 짧아요. ${MIN_CODE_LENGTH}자 이상이어야 해요.`, 'error');
      return false;
    }
    busyRef.current = true;
    try {
      const ticket = await toScannedTicket(raw, source, format);
      const found = await findTicket(ticket.hash);
      navigator.vibrate?.(40);
      if (found) setStep({ kind: 'duplicate', viewing: found.viewing, movie: found.movie });
      else setStep({ kind: 'details', ticket, detectedChain: detectChain(raw) });
      return true;
    } catch {
      // 예: 사파리 개인정보 보호 모드 등에서 저장소(IndexedDB)를 쓸 수 없을 때
      showToast('티켓을 확인하지 못했어요. 브라우저 저장소를 쓸 수 있는지 확인해 주세요.', 'error', 5000);
      return false;
    } finally {
      busyRef.current = false;
    }
  }, []);

  switch (step.kind) {
    case 'capture':
      return <CaptureStep onCode={handleCode} />;
    case 'duplicate':
      return <DuplicateStep viewing={step.viewing} movie={step.movie} onRestart={restart} />;
    case 'details':
      return (
        <DetailsStep
          ticket={step.ticket}
          detectedChain={step.detectedChain}
          onBack={restart}
          onDuplicate={(error) => setStep({ kind: 'duplicate', viewing: error.viewing, movie: error.movie })}
          onDone={(result, card) => setStep({ kind: 'reveal', result, card })}
        />
      );
    case 'reveal':
      return (
        <RevealOverlay
          result={step.result}
          card={step.card}
          onView={() => navigate({ name: 'movie', id: step.result.movie.id })}
          onClose={restart}
        />
      );
  }
}

function CaptureStep({ onCode }: { onCode: CodeHandler }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState('');
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const { detectInImage } = await import('../lib/scanner');
      const found = await detectInImage(file);
      if (!found) {
        showToast('사진에서 QR코드·바코드를 찾지 못했어요. 코드가 크고 선명하게 보이는 사진으로 다시 시도해 주세요.', 'error', 5000);
        return;
      }
      await onCode(found.rawValue, 'image', found.format);
    } catch {
      showToast('사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.', 'error');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="screen scan">
      <header className="screen-header">
        <p className="eyebrow">SCAN</p>
        <h1>티켓 스캔</h1>
        <p className="screen-header__desc">CGV · 롯데시네마 · 메가박스 종이 티켓이나 앱 티켓의 QR코드·바코드를 비춰 주세요.</p>
      </header>

      <CameraView onDetected={(c) => void onCode(c.rawValue, 'camera', c.format)} paused={reading} />

      <div className="scan__alts">
        <label className={`btn btn--ghost btn--block${reading ? ' is-busy' : ''}`}>
          <IconImage />
          {reading ? '사진에서 찾는 중…' : '사진·캡처에서 인식'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={reading}
            data-testid="scan-image-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          aria-expanded={manualOpen}
          aria-controls="manual-form"
          onClick={() => setManualOpen((v) => !v)}
        >
          <IconKeyboard />
          예매번호 직접 입력
        </button>
      </div>

      {manualOpen && (
        <form
          id="manual-form"
          className="panel manual"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onCode(code, 'manual');
          }}
        >
          <label htmlFor="manual-code" className="field__label">
            예매번호 · 티켓 번호
          </label>
          <div className="manual__row">
            <input
              id="manual-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="예) 1234-5678-9012"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              minLength={MIN_CODE_LENGTH}
              autoFocus
            />
            <button className="btn btn--primary" type="submit">
              확인
            </button>
          </div>
          <p className="field__hint">티켓에 인쇄된 예매번호도 괜찮아요. 같은 번호는 한 번만 등록할 수 있어요.</p>
        </form>
      )}

      <ul className="tips">
        <li>
          앱으로 예매했다면 모바일 티켓 화면을 캡처한 뒤 <b>사진·캡처에서 인식</b>을 눌러 주세요.
        </li>
        <li>종이 티켓은 구김을 펴고, 어두운 곳에서는 플래시를 켜 주세요.</li>
        <li>티켓 번호 원본은 저장하지 않아요. 중복 확인용으로 되돌릴 수 없는 해시값만 이 기기에 저장돼요.</li>
      </ul>
    </div>
  );
}

function DuplicateStep({ viewing, movie, onRestart }: { viewing: ViewingRecord; movie?: MovieRecord; onRestart: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="screen">
      <div className="panel notice notice--warn" role="alert">
        <h1 ref={headingRef} tabIndex={-1}>
          이미 등록된 티켓이에요
        </h1>
        <p>
          {movie ? <b>‘{movie.title}’</b> : '이 티켓'} · {formatDate(viewing.watchedAt)} · {CHAINS[viewing.chain].name} 관람으로
          등록돼 있어요.
        </p>
        <p className="muted small">같은 티켓은 한 번만 카드로 바꿀 수 있어요. (티켓 {viewing.codeHint})</p>
        <div className="actions">
          {movie && (
            <a className="btn btn--primary" href={href({ name: 'movie', id: movie.id })}>
              카드 보러 가기
            </a>
          )}
          <button type="button" className="btn btn--ghost" onClick={onRestart}>
            다른 티켓 스캔
          </button>
        </div>
      </div>
    </div>
  );
}

interface DetailsStepProps {
  ticket: ScannedTicket;
  detectedChain: ChainId | null;
  onBack: () => void;
  onDuplicate: (error: DuplicateTicketError) => void;
  onDone: (result: RegisterResult, card: CardModel) => void;
}

function DetailsStep({ ticket, detectedChain, onBack, onDuplicate, onDone }: DetailsStepProps) {
  const [chain, setChain] = useState<ChainId | ''>(() => detectedChain ?? getSettings().lastChain);
  const [date, setDate] = useState(todayLocal);
  const [pick, setPick] = useState<MoviePick | null>(null);
  const [busy, setBusy] = useState(false);
  const { items } = useCollection();
  const known = useMemo(() => new Map(items.map((s) => [s.movie.id, s.movie])), [items]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const today = todayLocal();

  useEffect(() => headingRef.current?.focus(), []);

  const missing = !chain ? '영화관을 골라 주세요.' : !pick ? '어떤 영화를 봤는지 골라 주세요.' : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chain || !pick || busy) return;
    setBusy(true);
    try {
      const movie = await resolveMovieInput(pick, getSettings().tmdbToken, known);
      const result = await registerViewing({ ticket, chain, watchedAt: date, movie });
      updateSettings({ lastChain: chain });
      notifyCollectionChanged();
      // 지킬 카드가 생겼으니 브라우저에 영구 보관을 요청 (결과와 상관없이 진행)
      void ensurePersistence();
      const summary = await getMovieSummary(result.movie.id);
      if (!summary) throw new Error('카드를 불러오지 못했어요.');
      onDone(result, cardFromSummary(summary));
    } catch (error) {
      setBusy(false);
      if (error instanceof DuplicateTicketError) onDuplicate(error);
      else showToast(error instanceof Error ? error.message : '등록에 실패했어요.', 'error');
    }
  };

  return (
    <form className="screen details" onSubmit={(e) => void submit(e)} noValidate>
      <header className="screen-header">
        <p className="eyebrow">STEP 2</p>
        <h1 ref={headingRef} tabIndex={-1}>
          관람 정보 확인
        </h1>
        <div className="ticket-pill" data-testid="ticket-pill">
          <span className="ticket-pill__format">{formatLabel(ticket.format)}</span>
          <span className="mono">{ticket.hint}</span>
          {detectedChain && <span className="ticket-pill__auto">{CHAINS[detectedChain].name} 티켓으로 인식</span>}
        </div>
      </header>

      <fieldset className="field">
        <legend className="field__label">영화관</legend>
        <div className="segmented">
          {CHAIN_IDS.map((id) => (
            <label key={id} className="segmented__item" style={{ '--chain-color': CHAINS[id].color } as CSSProperties}>
              <input type="radio" name="chain" value={id} checked={chain === id} onChange={() => setChain(id)} />
              <span>{CHAINS[id].name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="watched-at">
          관람일
        </label>
        <input
          id="watched-at"
          type="date"
          value={date}
          max={today}
          required
          onChange={(e) => setDate(e.target.value && e.target.value <= today ? e.target.value : today)}
        />
      </div>

      <fieldset className="field">
        <legend className="field__label">영화</legend>
        <MoviePicker value={pick} onChange={setPick} collection={items} />
      </fieldset>

      <div className="sticky-actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          다시 스캔
        </button>
        <button
          type="submit"
          className="btn btn--primary btn--grow"
          disabled={Boolean(missing) || busy}
          aria-describedby={missing ? 'submit-hint' : undefined}
        >
          {busy ? '카드 만드는 중…' : '카드 받기'}
        </button>
      </div>
      {missing && (
        <p id="submit-hint" className="field__hint center">
          {missing}
        </p>
      )}
    </form>
  );
}
