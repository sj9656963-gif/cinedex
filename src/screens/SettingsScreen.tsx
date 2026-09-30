import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { IconDownload, IconExternal, IconUpload } from '../components/Icons';
import { exportBackup, importBackup } from '../lib/backup';
import { clearCollection } from '../lib/collection';
import { notifyCollectionChanged, useCollection } from '../lib/hooks';
import { updateSettings, useSettings } from '../lib/settings';
import { getPersistState, getUsageBytes, isIOS, isStandalone, requestPersistence, type PersistState } from '../lib/storage';
import { TmdbError, verifyToken } from '../lib/tmdb';
import { showToast } from '../lib/toast';
import { formatBytes, formatDate, todayLocal } from '../lib/util';

const PERSIST_LABELS: Record<PersistState | 'loading', string> = {
  persisted: '영구 보관',
  'best-effort': '기본 보관',
  unsupported: '확인 불가',
  loading: '확인 중…',
};

export function SettingsScreen() {
  const settings = useSettings();
  const [token, setToken] = useState(settings.tmdbToken);
  const [reveal, setReveal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dialog, confirm] = useConfirm();
  const importRef = useRef<HTMLInputElement>(null);
  const { items } = useCollection();
  const totalViews = items.reduce((sum, s) => sum + s.count, 0);
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const ios = isIOS();
  const standalone = isStandalone();

  // 기록 수가 바뀌면(불러오기·초기화) 보관 상태와 사용 공간을 다시 읽는다.
  useEffect(() => {
    let alive = true;
    void Promise.all([getPersistState(), getUsageBytes()]).then(([state, bytes]) => {
      if (!alive) return;
      setPersist(state);
      setUsage(bytes);
    });
    return () => {
      alive = false;
    };
  }, [totalViews]);

  const askPersist = async () => {
    const state = await requestPersistence();
    setPersist(state);
    if (state === 'persisted') showToast('영구 보관이 켜졌어요.', 'success');
    else showToast('브라우저가 아직 허용하지 않았어요. 홈 화면에 추가해서 쓰면 허용될 가능성이 높아요.', 'info', 5000);
  };

  const saveToken = async (e: FormEvent) => {
    e.preventDefault();
    const value = token.trim();
    setToken(value);
    if (!value) {
      updateSettings({ tmdbToken: '' });
      showToast('TMDB 토큰을 지웠어요.');
      return;
    }
    setChecking(true);
    try {
      await verifyToken(value);
      updateSettings({ tmdbToken: value });
      showToast('TMDB에 연결됐어요. 이제 영화 검색과 공식 포스터를 쓸 수 있어요.', 'success');
    } catch (err) {
      if (err instanceof TmdbError && err.status === 0) {
        // 오프라인 등으로 확인만 못 한 경우에는 저장은 해 둔다.
        updateSettings({ tmdbToken: value });
        showToast('토큰은 저장했지만 인터넷 연결이 없어 확인하지 못했어요.', 'info', 5000);
      } else {
        showToast(err instanceof Error ? err.message : String(err), 'error', 5000);
      }
    } finally {
      setChecking(false);
    }
  };

  const download = async () => {
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cinedex-backup-${todayLocal()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      updateSettings({ lastBackupAt: Date.now() });
      showToast(`백업 파일을 저장했어요. (영화 ${data.movies.length}편 · 관람 ${data.viewings.length}회)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '백업에 실패했어요.', 'error');
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const result = await importBackup(data);
      notifyCollectionChanged();
      showToast(
        `불러오기 완료: 관람 ${result.viewings}회 추가${result.skipped ? ` · 이미 있던 티켓 ${result.skipped}개는 건너뜀` : ''}`,
        'success',
        5000,
      );
    } catch (err) {
      const message = err instanceof SyntaxError ? 'JSON 파일이 아니에요.' : err instanceof Error ? err.message : String(err);
      showToast(`불러오지 못했어요. ${message}`, 'error', 5000);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: '도감을 모두 지울까요?',
      message: '모든 카드와 관람 기록이 이 기기에서 삭제되고 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두는 것을 권해요.',
      confirmLabel: '모두 삭제',
      danger: true,
    });
    if (!ok) return;
    await clearCollection();
    notifyCollectionChanged();
    showToast('도감을 초기화했어요.');
  };

  return (
    <div className="screen settings">
      <header className="screen-header">
        <p className="eyebrow">SETTINGS</p>
        <h1>설정</h1>
      </header>

      <section className="panel section" aria-labelledby="storage-title">
        <h2 id="storage-title" className="section__title">
          내 카드 저장
        </h2>
        <p className="muted small">
          카드와 관람 기록은 이 휴대폰의 브라우저 안에 저장돼요. 앱을 닫았다 다시 열어도, 앱이 업데이트돼도 그대로 남아 있어요.
        </p>
        <dl className="storage-stats" data-testid="storage-stats">
          <div>
            <dt>저장된 기록</dt>
            <dd>
              영화 {items.length}편 · 관람 {totalViews}회
            </dd>
          </div>
          <div>
            <dt>보관 방식</dt>
            <dd className={persist === 'persisted' ? 'is-good' : undefined} data-testid="persist-state">
              {PERSIST_LABELS[persist ?? 'loading']}
            </dd>
          </div>
          <div>
            <dt>사용 공간</dt>
            <dd>{usage === null ? '-' : formatBytes(usage)}</dd>
          </div>
          <div>
            <dt>마지막 백업</dt>
            <dd data-testid="last-backup">
              {settings.lastBackupAt ? formatDate(todayLocal(new Date(settings.lastBackupAt))) : '아직 없음'}
            </dd>
          </div>
        </dl>

        {persist === 'persisted' && (
          <p className="muted small">영구 보관 중이라 휴대폰 저장 공간이 부족해져도 브라우저가 자동으로 지우지 않아요.</p>
        )}
        {persist === 'best-effort' && (
          <div className="storage-note">
            <p className="muted small">
              지금은 기본 보관이라, 휴대폰 저장 공간이 아주 부족해지면 브라우저가 지울 수 있어요. 홈 화면에 추가해서 쓰면 영구 보관이
              허용될 가능성이 높아요.
            </p>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void askPersist()}>
              영구 보관 요청
            </button>
          </div>
        )}

        {ios && !standalone && (
          <div className="callout callout--warn" role="note">
            <b>아이폰은 홈 화면에 추가해서 쓰세요.</b> 사파리에서는 7일 동안 들어오지 않으면 저장된 카드가 지워질 수 있어요. 공유 버튼 →
            ‘홈 화면에 추가’로 설치하면 이 규칙이 적용되지 않아요. 사파리와 홈 화면 앱은 저장 공간이 따로라서, 이미 모은 카드는 아래
            ‘백업 파일 저장’ 후 홈 화면 앱에서 ‘백업 불러오기’로 옮겨 주세요.
          </div>
        )}
        {ios && standalone && <p className="muted small">홈 화면 앱으로 쓰고 있어서 사파리의 7일 삭제 규칙이 적용되지 않아요.</p>}

        <ul className="muted small plain-list">
          <li>브라우저의 방문 기록·사이트 데이터를 지우거나, 시크릿(개인정보 보호) 모드에서 쓰고 창을 닫으면 지워져요.</li>
          <li>휴대폰을 바꾸거나 다른 브라우저로 열면 카드가 보이지 않아요. 백업 파일로 옮길 수 있어요.</li>
        </ul>

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={() => void download()}>
            <IconDownload /> 백업 파일 저장
          </button>
          <label className="btn btn--ghost">
            <IconUpload /> 백업 불러오기
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              data-testid="backup-input"
              onChange={(e) => void restore(e.target.files?.[0])}
            />
          </label>
        </div>
      </section>

      <section className="panel section">
        <h2 className="section__title">영화 검색 · 공식 포스터 (TMDB)</h2>
        <p className="muted small">
          TMDB(The Movie Database)의 무료 API 토큰을 넣으면 영화를 검색하고, 등급마다 다른 공식 포스터를 카드에 넣을 수 있어요. 토큰이
          없어도 제목을 직접 입력해서 쓸 수 있어요.
        </p>
        <form className="token-form" onSubmit={(e) => void saveToken(e)}>
          <label className="field__label" htmlFor="tmdb-token">
            API 읽기 액세스 토큰 또는 API 키
          </label>
          <div className="token-form__row">
            <input
              id="tmdb-token"
              type={reveal ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
              {reveal ? '숨기기' : '보기'}
            </button>
          </div>
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={checking}>
              {checking ? '확인 중…' : '저장하고 연결 확인'}
            </button>
            <a className="btn btn--ghost" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">
              토큰 발급받기 <IconExternal />
            </a>
          </div>
          <p className="field__hint">
            {settings.tmdbToken ? '연결됨 · ' : ''}토큰은 이 기기(브라우저)에만 저장되고, TMDB에 영화 정보를 요청할 때만 쓰여요.
          </p>
        </form>
      </section>

      <section className="panel section">
        <h2 className="section__title">화면 효과</h2>
        <label className="switch-row">
          <span>
            <span className="switch-row__label">기울여서 보기</span>
            <span className="muted small switch-row__desc">카드 화면에서 휴대폰을 기울이면 홀로그램이 움직여요.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.tilt}
            onChange={(e) => updateSettings({ tilt: e.target.checked })}
          />
        </label>
      </section>

      <section className="panel section">
        <h2 className="section__title">데이터</h2>
        <button type="button" className="btn btn--danger" onClick={() => void reset()}>
          도감 초기화
        </button>
      </section>

      <section className="section about">
        <h2 className="section__title">안내</h2>
        <ul className="muted small about__list">
          <li>
            CGV · 롯데시네마 · 메가박스는 티켓 QR코드 형식이나 인증 API를 공개하지 않아서, 씨네덱스는 코드 안의 주소·문구로 극장을 추정하고
            확실하지 않으면 직접 고르게 해요. 티켓의 진위는 확인하지 않아요.
          </li>
          <li>티켓 번호 원본은 저장하지 않아요. 같은 티켓의 중복 등록을 막기 위한 해시값과 끝자리 몇 개만 이 기기에 저장돼요.</li>
          <li>영화 포스터의 저작권은 각 영화 제작·배급사에 있어요. 개인 소장용으로만 사용해 주세요.</li>
          <li>This product uses the TMDB API but is not endorsed or certified by TMDB.</li>
        </ul>
        <p className="muted small">씨네덱스 v0.1.0</p>
      </section>
      {dialog}
    </div>
  );
}
