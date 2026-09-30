/**
 * E2E 테스트용 고정 데이터 (티켓 QR/바코드 이미지, 가짜 카메라 영상, 가짜 포스터, 백업 파일)
 */
import { toBuffer } from 'bwip-js/node';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

export const FIXTURE_DIR = path.resolve(import.meta.dirname, '.tmp');

export const CODES = {
  cgvQr: 'https://m.cgv.co.kr/WebApp/MyCgvV5/ticketDetail.aspx?no=T20260930123456',
  megaboxQr: 'https://m.megabox.co.kr/booking/ticket?no=MB2026093000077',
  lotteQr: 'https://www.lottecinema.co.kr/NLCMW/Ticket/Detail?no=LT7766554433',
  barcode: '1234567890123',
} as const;

export const fixturePath = (name: string) => path.join(FIXTURE_DIR, name);

async function qrPng(text: string): Promise<Buffer> {
  return toBuffer({ bcid: 'qrcode', text, scale: 6, paddingwidth: 12, paddingheight: 12, backgroundcolor: 'FFFFFF' });
}

async function code128Png(text: string): Promise<Buffer> {
  return toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 16,
    includetext: true,
    textxalign: 'center',
    paddingwidth: 24,
    paddingheight: 12,
    backgroundcolor: 'FFFFFF',
  });
}

/** PNG 를 흰 바탕 캔버스 가운데에 놓고 YUV420 으로 바꿔 Chrome 가짜 카메라용 y4m 을 만든다. */
function pngToY4m(png: Buffer, width = 640, height = 480, targetSize = 340, frames = 3): Buffer {
  const src = PNG.sync.read(png);
  const scale = Math.min(targetSize / src.width, targetSize / src.height);
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const ox = Math.round((width - w) / 2);
  const oy = Math.round((height - h) / 2);

  const rgb = new Uint8Array(width * height * 3).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const sy = Math.min(src.height - 1, Math.floor(y / scale));
      const si = (sy * src.width + sx) * 4;
      const di = ((oy + y) * width + (ox + x)) * 3;
      const a = src.data[si + 3] / 255;
      for (let c = 0; c < 3; c++) rgb[di + c] = Math.round(src.data[si + c] * a + 255 * (1 - a));
    }
  }

  const ySize = width * height;
  const cSize = (width / 2) * (height / 2);
  const frame = new Uint8Array(ySize + cSize * 2);
  for (let i = 0; i < ySize; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    frame[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (let cy = 0; cy < height / 2; cy++) {
    for (let cx = 0; cx < width / 2; cx++) {
      const i = (cy * 2 * width + cx * 2) * 3;
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];
      const ci = cy * (width / 2) + cx;
      frame[ySize + ci] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)));
      frame[ySize + cSize + ci] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)));
    }
  }

  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), Buffer.from(frame));
  return Buffer.concat(parts);
}

export async function generateFixtures(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const cgv = await qrPng(CODES.cgvQr);
  const lotte = await qrPng(CODES.lotteQr);
  const megabox = await qrPng(CODES.megaboxQr);
  await writeFile(fixturePath('ticket-cgv-qr.png'), cgv);
  await writeFile(fixturePath('ticket-lotte-qr.png'), lotte);
  await writeFile(fixturePath('ticket-barcode.png'), await code128Png(CODES.barcode));
  await writeFile(fixturePath('camera-megabox-qr.y4m'), pngToY4m(megabox));
}

/* ---------- 가짜 TMDB 포스터 (SVG) ---------- */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 파일 이름마다 색·구도가 다른 영화 포스터 느낌의 SVG. textless 면 글자 없는 아트 포스터 */
export function posterSvg(file: string): string {
  const h = hash(file);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  const textless = /-[456]\./.test(file);
  const title = (file.match(/\/?([a-z]+)/i)?.[1] ?? 'movie').toUpperCase();
  const sunY = 250 + (h % 120);
  const peaks = Array.from({ length: 7 }, (_, i) => `${i * 85} ${470 + ((h >> (i * 3)) % 110)}`).join(' L');
  const stars = Array.from({ length: 40 }, (_, i) => {
    const x = (h * (i + 3) * 7919) % 500;
    const y = (h * (i + 7) * 104729) % 300;
    return `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity="${0.35 + (i % 5) / 10}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,14%)"/>
      <stop offset=".55" stop-color="hsl(${hue2},75%,38%)"/>
      <stop offset="1" stop-color="hsl(${(hue2 + 30) % 360},85%,60%)"/>
    </linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff8e6"/>
      <stop offset=".45" stop-color="hsl(${(hue + 180) % 360},100%,72%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 180) % 360},100%,60%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="750" fill="url(#sky)"/>
  ${stars}
  <circle cx="250" cy="${sunY}" r="170" fill="url(#sun)"/>
  <path d="M0 520 L${peaks} L500 500 L500 750 L0 750Z" fill="hsl(${hue},45%,9%)"/>
  <path d="M0 610 L90 560 L170 600 L260 540 L360 610 L440 570 L500 600 L500 750 L0 750Z" fill="hsl(${hue},40%,5%)"/>
  <path d="M232 545 l18 -60 l18 60 z" fill="hsl(${hue},40%,5%)"/>
  ${
    textless
      ? ''
      : `<text x="250" y="665" font-family="Arial Black, Arial, sans-serif" font-size="60" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="5">${title}</text>
  <text x="250" y="705" font-family="Arial, sans-serif" font-size="17" fill="#fff" opacity=".75" text-anchor="middle" letter-spacing="8">IN THEATERS 2026</text>`
  }
</svg>`;
}

/* ---------- 도감 백업 (6개 등급 + 포스터 없는 영화) ---------- */

export interface SeedMovie {
  key: string;
  title: string;
  original?: string;
  count: number;
  chains: ('CGV' | 'LOTTE' | 'MEGABOX' | 'OTHER')[];
  local?: boolean;
}

export const SEED_MOVIES: SeedMovie[] = [
  { key: 'emperor', title: '엠퍼러: 황금의 왕좌', original: 'Emperor', count: 10, chains: ['CGV', 'LOTTE', 'MEGABOX'] },
  { key: 'prism', title: '프리즘', original: 'Prism', count: 7, chains: ['MEGABOX', 'CGV', 'LOTTE'] },
  { key: 'golden', title: '골든 아워', original: 'Golden Hour', count: 5, chains: ['LOTTE', 'CGV'] },
  { key: 'deepblue', title: '딥 블루', original: 'Deep Blue', count: 3, chains: ['CGV'] },
  { key: 'redline', title: '레드 라인', original: 'Red Line', count: 2, chains: ['MEGABOX'] },
  { key: 'starsong', title: '별의 노래', original: 'Star Song', count: 1, chains: ['CGV'] },
  { key: 'mine', title: '우리 동네 영화제', count: 1, chains: ['OTHER'], local: true },
];

export function seedBackup(movies: SeedMovie[] = SEED_MOVIES) {
  const outMovies: Record<string, unknown>[] = [];
  const viewings: Record<string, unknown>[] = [];
  let serial = 0;
  const base = Date.UTC(2026, 5, 1);
  // 오래된 영화부터 등록해서 도감에서는 목록 순서가 뒤집혀 보이게
  [...movies].reverse().forEach((m, mi) => {
    const id = m.local ? `local:${m.key}` : `tmdb:${90000 + mi}`;
    outMovies.push({
      id,
      title: m.title,
      ...(m.original ? { originalTitle: m.original } : {}),
      year: m.local ? undefined : '2026',
      ...(m.local
        ? {}
        : {
            tmdbId: 90000 + mi,
            posterPath: `/${m.key}-1.jpg`,
            tierPosters: [1, 2, 3, 4, 5, 6].map((n) => `/${m.key}-${n}.jpg`),
          }),
      createdAt: base,
      updatedAt: base,
    });
    for (let i = 0; i < m.count; i++) {
      serial += 1;
      const day = new Date(base + serial * 86_400_000).toISOString().slice(0, 10);
      viewings.push({
        id: `seed-${m.key}-${i}`,
        movieId: id,
        ticketHash: `seedhash-${m.key}-${i}`.padEnd(24, '0'),
        codeHint: `••••${String(1000 + serial).slice(-4)}`,
        source: i % 3 === 0 ? 'camera' : i % 3 === 1 ? 'image' : 'manual',
        chain: m.chains[i % m.chains.length],
        watchedAt: day,
        registeredAt: base + serial * 86_400_000,
        serial,
      });
    }
  });
  return { app: 'cinedex', version: 1, exportedAt: new Date(base).toISOString(), serial, movies: outMovies, viewings };
}
