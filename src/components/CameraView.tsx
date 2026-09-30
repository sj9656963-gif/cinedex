import { useEffect, useRef, useState } from 'react';
import type { CodeDetector, DetectedCode } from '../lib/scanner';
import { showToast } from '../lib/toast';
import { IconFlash } from './Icons';

// 타입만 가져온다 (실제 모듈은 카메라가 켜진 뒤 동적 import)
type ScannerModule = typeof import('../lib/scanner');

type CameraState = 'starting' | 'live' | 'denied' | 'unavailable' | 'insecure';

interface CameraViewProps {
  onDetected: (code: DetectedCode) => void;
  /** 사진 인식 중처럼 잠시 멈출 때 */
  paused?: boolean;
}

/** 후면 카메라로 QR/바코드를 계속 인식한다. 화면에서 사라지면 카메라를 끈다. */
export function CameraView({ onDetected, paused = false }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onDetectedRef = useRef(onDetected);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<CameraState>('starting');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    pausedRef.current = paused;
  });

  useEffect(() => {
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }

    let stopped = false;
    let stream: MediaStream | undefined;
    let timer = 0;
    let last = { value: '', at: 0 };
    setState('starting');

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        if (stopped) return;
        const name = error instanceof DOMException ? error.name : '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // muted + playsInline 이라 자동 재생은 보통 허용된다.
      }
      const [track] = stream.getVideoTracks();
      trackRef.current = track ?? null;
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (stopped) return;
      setTorch({ supported: Boolean(capabilities?.torch), on: false });
      setState('live');

      // 인식 라이브러리(zxing wasm)는 스캔 화면에서만 필요하므로 이때 불러온다.
      let scanner: ScannerModule;
      let detector: CodeDetector;
      try {
        scanner = await import('../lib/scanner');
        if (stopped) return;
        detector = await scanner.createDetector();
      } catch {
        if (!stopped) showToast('스캐너를 불러오지 못했어요. 새로고침하거나 사진 인식을 이용해 주세요.', 'error', 5000);
        return;
      }
      const { pickBestCode } = scanner;
      const tick = async () => {
        if (stopped) return;
        if (!pausedRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          try {
            const best = pickBestCode(await detector.detect(video));
            const now = Date.now();
            // 같은 코드가 계속 잡혀도 2.5초에 한 번만 알린다. (거절된 코드 반복 방지)
            if (best && !stopped && !(best.rawValue === last.value && now - last.at < 2500)) {
              last = { value: best.rawValue, at: now };
              onDetectedRef.current(best);
            }
          } catch {
            // 한 프레임 인식 실패는 무시
          }
        }
        if (!stopped) timer = window.setTimeout(tick, 160);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [attempt]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as unknown as MediaTrackConstraintSet] });
      setTorch({ supported: true, on });
    } catch {
      showToast('이 기기에서는 플래시를 켤 수 없어요.', 'error');
    }
  };

  return (
    <div className="camera" data-state={state}>
      <video ref={videoRef} className="camera__video" muted playsInline autoPlay aria-label="카메라 미리보기" />
      {state === 'live' && (
        <div className="camera__frame" aria-hidden="true">
          <span className="camera__corner camera__corner--tl" />
          <span className="camera__corner camera__corner--tr" />
          <span className="camera__corner camera__corner--bl" />
          <span className="camera__corner camera__corner--br" />
          <span className="camera__laser" />
        </div>
      )}
      {state === 'live' && <p className="camera__caption">QR코드·바코드를 네모 안에 맞춰 주세요</p>}
      {state !== 'live' && (
        <div className="camera__message" role="status">
          {state === 'starting' && <p>카메라를 켜는 중…</p>}
          {state === 'denied' && (
            <>
              <p>카메라 권한이 꺼져 있어요.</p>
              <p className="muted">브라우저 설정에서 카메라를 허용하거나, 아래의 사진 인식·직접 입력을 이용해 주세요.</p>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setAttempt((n) => n + 1)}>
                다시 시도
              </button>
            </>
          )}
          {state === 'unavailable' && (
            <>
              <p>사용할 수 있는 카메라를 찾지 못했어요.</p>
              <p className="muted">아래의 사진 인식이나 직접 입력을 이용해 주세요.</p>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setAttempt((n) => n + 1)}>
                다시 시도
              </button>
            </>
          )}
          {state === 'insecure' && (
            <>
              <p>카메라는 HTTPS 주소에서만 켤 수 있어요.</p>
              <p className="muted">휴대폰에서 테스트할 때는 PC에서 npm run dev:phone 으로 실행한 https 주소로 접속해 주세요.</p>
            </>
          )}
        </div>
      )}
      {torch.supported && (
        <button
          type="button"
          className="camera__torch icon-btn"
          aria-pressed={torch.on}
          aria-label={torch.on ? '플래시 끄기' : '플래시 켜기'}
          onClick={() => void toggleTorch()}
        >
          <IconFlash />
        </button>
      )}
    </div>
  );
}
