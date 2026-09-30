/** 보안 컨텍스트(HTTPS)가 아니어도 동작하는 UUID v4 (crypto.randomUUID는 HTTPS 전용) */
export function uid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 로컬 시간 기준 YYYY-MM-DD */
export function todayLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' */
export function formatDate(isoDate: string): string {
  return isoDate.replaceAll('-', '.');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 문자열 → 32bit 해시 (FNV-1a). 생성 포스터 색상처럼 보안과 무관한 용도 전용 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 카드 일련번호 표기: 12 → '0012' */
export function padSerial(serial: number): string {
  return String(serial).padStart(4, '0');
}

/** 1536 → '1.5KB', 2_400_000 → '2.3MB' */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
