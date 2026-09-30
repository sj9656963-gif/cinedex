import { describe, expect, it } from 'vitest';
import {
  hashTicketCode,
  isPlausibleTicketCode,
  maskTicketCode,
  normalizeTicketCode,
  toScannedTicket,
} from '../../src/lib/ticket';

describe('normalizeTicketCode', () => {
  it('숫자+구분자로만 된 예매번호는 숫자만 남긴다', () => {
    expect(normalizeTicketCode(' 1234-5678 9012 ')).toBe('123456789012');
    expect(normalizeTicketCode('1234.5678.9012')).toBe('123456789012');
  });

  it('전각 숫자도 반각으로 맞춘다', () => {
    expect(normalizeTicketCode('１２３４－５６７８')).toBe('12345678');
  });

  it('문자가 섞인 코드(URL 등)는 공백만 정리하고 그대로 둔다', () => {
    expect(normalizeTicketCode('  https://m.cgv.co.kr/t?id=AB-12   34 ')).toBe('https://m.cgv.co.kr/t?id=AB-12 34');
  });
});

describe('isPlausibleTicketCode', () => {
  it('6자 미만은 티켓 코드로 보지 않는다', () => {
    expect(isPlausibleTicketCode('12345')).toBe(false);
    expect(isPlausibleTicketCode('123456')).toBe(true);
  });
});

describe('hashTicketCode', () => {
  it('같은 코드는 같은 SHA-256 해시, 다른 코드는 다른 해시', async () => {
    const a = await hashTicketCode('123456789012');
    const b = await hashTicketCode('123456789012');
    const c = await hashTicketCode('123456789013');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('원본 번호가 해시에 드러나지 않는다', async () => {
    const hash = await hashTicketCode('987654321098');
    expect(hash).not.toContain('987654321098');
  });
});

describe('maskTicketCode', () => {
  it('끝자리만 보여준다', () => {
    expect(maskTicketCode('123456789012')).toBe('••••9012');
    expect(maskTicketCode('123456')).toBe('••••56');
  });
});

describe('toScannedTicket', () => {
  it('하이픈 입력과 스캔 값이 같은 티켓으로 판별된다', async () => {
    const typed = await toScannedTicket('1234-5678-9012', 'manual');
    const scanned = await toScannedTicket('123456789012', 'camera', 'code_128');
    expect(typed.hash).toBe(scanned.hash);
    expect(scanned).toMatchObject({ hint: '••••9012', format: 'code_128', source: 'camera' });
  });
});
