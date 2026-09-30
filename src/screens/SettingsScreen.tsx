import { useRef, useState, type FormEvent } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { IconDownload, IconExternal, IconUpload } from '../components/Icons';
import { exportBackup, importBackup } from '../lib/backup';
import { clearCollection } from '../lib/collection';
import { notifyCollectionChanged } from '../lib/hooks';
import { updateSettings, useSettings } from '../lib/settings';
import { TmdbError, verifyToken } from '../lib/tmdb';
import { showToast } from '../lib/toast';
import { todayLocal } from '../lib/util';

export function SettingsScreen() {
  const settings = useSettings();
  const [token, setToken] = useState(settings.tmdbToken);
  const [reveal, setReveal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dialog, confirm] = useConfirm();
  const importRef = useRef<HTMLInputElement>(null);

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
        <h2 className="section__title">백업</h2>
        <p className="muted small">
          도감은 이 기기에만 저장돼요. 휴대폰을 바꾸거나 브라우저 데이터를 지우기 전에 백업 파일을 저장해 두세요.
        </p>
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
