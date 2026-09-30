/**
 * QR/바코드 인식.
 * - 안드로이드 크롬 등 네이티브 BarcodeDetector 가 있으면 그것을 쓰고
 * - 없으면(iOS 사파리, 데스크톱) zxing-wasm 기반 폴리필을 쓴다.
 * wasm 파일은 CDN 이 아니라 앱과 함께 배포해서(오프라인/CSP 대응) 로컬에서 불러온다.
 */
import { BarcodeDetector as ZXingBarcodeDetector, prepareZXingModule, type BarcodeFormat } from 'barcode-detector/ponyfill';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface DetectedCode {
  rawValue: string;
  format: string;
}

type DetectSource = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap | Blob | ImageData;

export interface CodeDetector {
  detect(source: DetectSource): Promise<DetectedCode[]>;
}

/** 영화 티켓에 쓰일 만한 형식. (상품 바코드 오인식을 줄이려고 전체 형식 대신 목록 지정) */
export const TICKET_FORMATS = [
  'qr_code',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'itf',
  'ean_13',
  'ean_8',
  'upc_a',
  'pdf417',
  'data_matrix',
  'aztec',
] as const satisfies readonly BarcodeFormat[];

let zxingPrepared = false;

function prepareZXing(): void {
  if (zxingPrepared) return;
  zxingPrepared = true;
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
    },
  });
}

function createZXingDetector(): CodeDetector {
  prepareZXing();
  return new ZXingBarcodeDetector({ formats: [...TICKET_FORMATS] });
}

interface NativeBarcodeDetector {
  detect(source: DetectSource): Promise<DetectedCode[]>;
}

interface NativeBarcodeDetectorClass {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

async function createNativeDetector(): Promise<NativeBarcodeDetector | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetectorClass }).BarcodeDetector;
  if (!Native || typeof Native.getSupportedFormats !== 'function') return null;
  try {
    const supported = await Native.getSupportedFormats();
    if (!supported.includes('qr_code')) return null;
    return new Native({ formats: TICKET_FORMATS.filter((f) => supported.includes(f)) });
  } catch {
    return null;
  }
}

/** 네이티브 인식기가 실패하면 자동으로 zxing 으로 전환하는 인식기 */
export async function createDetector(): Promise<CodeDetector> {
  let native = await createNativeDetector();
  let zxing: CodeDetector | null = native ? null : createZXingDetector();
  return {
    async detect(source) {
      if (native) {
        try {
          return await native.detect(source);
        } catch {
          native = null;
        }
      }
      zxing ??= createZXingDetector();
      return zxing.detect(source);
    },
  };
}

/** 여러 개가 잡히면 QR 우선, 그다음 긴 값(정보가 많은 쪽) */
export function pickBestCode(codes: readonly DetectedCode[]): DetectedCode | null {
  const valid = codes.filter((c) => c.rawValue.trim().length > 0);
  if (valid.length === 0) return null;
  return [...valid].sort((a, b) => {
    const qa = a.format === 'qr_code' ? 1 : 0;
    const qb = b.format === 'qr_code' ? 1 : 0;
    return qb - qa || b.rawValue.length - a.rawValue.length;
  })[0];
}

/** 사진/스크린샷에서 인식. 큰 사진에서 못 찾으면 축소본으로 한 번 더 시도한다. */
export async function detectInImage(file: Blob, detector?: CodeDetector): Promise<DetectedCode | null> {
  const d = detector ?? (await createDetector());
  const direct = pickBestCode(await d.detect(file));
  if (direct) return direct;
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= 1600) return null;
    const scale = 1600 / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return pickBestCode(await d.detect(canvas));
  } finally {
    bitmap.close();
  }
}
