import { describe, expect, it } from 'vitest';
import { detectChain, isChainId } from '../../src/lib/chains';

describe('detectChain', () => {
  it.each([
    ['https://m.cgv.co.kr/WebApp/Ticket?no=1234', 'CGV'],
    ['CGV1234567890', 'CGV'],
    ['cgv:ticket:0012', 'CGV'],
    ['https://www.lottecinema.co.kr/NLCMW/Ticket?x=1', 'LOTTE'],
    ['LOTTE CINEMA 2026', 'LOTTE'],
    ['롯데시네마 월드타워', 'LOTTE'],
    ['https://m.megabox.co.kr/booking?no=99', 'MEGABOX'],
    ['MEGA-BOX 1234', 'MEGABOX'],
    ['메가박스 코엑스', 'MEGABOX'],
  ])('%s → %s', (raw, expected) => {
    expect(detectChain(raw)).toBe(expected);
  });

  it.each(['123456789012', 'ABCGVX12', 'https://example.com/ticket/1', 'lotte.com/shopping'])(
    '근거가 없으면 추정하지 않는다: %s',
    (raw) => {
      expect(detectChain(raw)).toBeNull();
    },
  );
});

describe('isChainId', () => {
  it('허용된 값만 통과', () => {
    expect(isChainId('CGV')).toBe(true);
    expect(isChainId('OTHER')).toBe(true);
    expect(isChainId('cgv')).toBe(false);
    expect(isChainId(1)).toBe(false);
  });
});
