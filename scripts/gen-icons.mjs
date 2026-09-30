// public/favicon.svg → PWA 아이콘 PNG 생성 (설치된 Chrome으로 렌더링)
// 사용: npm run icons
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'public', 'icons');
const svg = await readFile(path.join(root, 'public', 'favicon.svg'), 'utf8');
// 마스커블/애플 아이콘은 OS가 모서리를 자르므로 둥근 모서리 없이 꽉 채운 배경을 쓴다.
const squareSvg = svg.replace('rx="112"', 'rx="0"');

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

// 카드 그림의 가장 먼 모서리가 중심에서 약 199px(512 기준)이라 마스커블 안전 영역(반지름 40% = 205px) 안에 들어온다.
// 그래서 마스커블은 축소 없이 배경만 꽉 채워서 렌더링한다.
async function render(size, file, { square = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const icon = square ? squareSvg : svg;
  await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;width:100%;height:100%;background:transparent}
      svg{display:block;width:100%;height:100%}
    </style></head><body>${icon}</body></html>`);
  await page.screenshot({ path: path.join(outDir, file), omitBackground: !square });
  console.log('done:', file);
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { square: true });
await render(180, 'apple-touch-icon.png', { square: true });
await browser.close();
