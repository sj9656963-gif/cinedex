/**
 * 티켓 코드 처리.
 *
 * 개인정보 보호를 위해 티켓의 원본 번호는 저장하지 않는다.
 * 정규화한 코드의 SHA-256 해시만 저장해서 "같은 티켓 중복 등록"을 막고,
 * 화면에는 끝 몇 자리만 마스킹해서 보여준다.
 */

export type ScanSource = 'camera' | 'image' | 'manual';

export interface ScannedTicket {
  /** 정규화된 코드의 해시 (중복 판별 키) */
  hash: string;
  /** 화면 표시용 마스킹 문자열 (예: ••••1234) */
  hint: string;
  /** 바코드 종류 (qr_code, code_128 …). 직접 입력이면 없음 */
  format?: string;
  source: ScanSource;
}

export const MIN_CODE_LENGTH = 6;

/**
 * 스캔 값/직접 입력 값을 같은 형태로 맞춘다.
 * - 전각 문자 → 반각 (NFKC), 앞뒤 공백 제거, 연속 공백 1칸
 * - 숫자와 구분자(공백, 하이픈, 점)만 있으면 숫자만 남긴다 → "1234-5678" 과 "12345678" 을 같은 티켓으로 처리
 */
export function normalizeTicketCode(raw: string): string {
  const text = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (/^[\d\s.\-–—]+$/.test(text)) return text.replace(/\D/g, '');
  return text;
}

export function isPlausibleTicketCode(normalized: string): boolean {
  return normalized.length >= MIN_CODE_LENGTH;
}

const HASH_PREFIX = 'cinedex:ticket:v1:';

export async function hashTicketCode(normalized: string): Promise<string> {
  const input = HASH_PREFIX + normalized;
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // crypto.subtle 은 HTTPS 에서만 제공된다. (예: http://192.168.x.x 로 접속한 개발 환경)
  return fallbackHash(input);
}

/** 비보안 컨텍스트용 대체 해시 (cyrb53 두 번). 암호학적 용도가 아닌 중복 판별용 */
function fallbackHash(input: string): string {
  const cyrb53 = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  };
  return `fb-${cyrb53(1)}${cyrb53(2)}`;
}

/** 끝자리 일부만 보여준다. 짧은 코드는 노출 자릿수를 줄인다. */
export function maskTicketCode(normalized: string): string {
  const visible = Math.max(1, Math.min(4, Math.floor(normalized.length / 3)));
  return `••••${normalized.slice(-visible)}`;
}

export async function toScannedTicket(raw: string, source: ScanSource, format?: string): Promise<ScannedTicket> {
  const normalized = normalizeTicketCode(raw);
  return {
    hash: await hashTicketCode(normalized),
    hint: maskTicketCode(normalized),
    format,
    source,
  };
}
