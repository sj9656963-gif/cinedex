/**
 * 울트라 레어 이상 카드에 쓰는 "글리터" 텍스처를 캔버스로 한 번 그려서
 * CSS 변수(--sparkle-texture)로 등록한다. 투명 바탕 + 무지개 점/별이라
 * 여러 겹 쌓아도 서로 가리지 않고, mix-blend-mode: color-dodge 로 올리면 반짝이만 밝게 빛난다.
 */
export function installSparkleTexture(): void {
  if (typeof document === 'undefined') return;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let seed = 20260930;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // 타일 경계에서 잘리지 않도록 가장자리 근처 요소는 반대편에도 한 번 더 그린다.
  const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const px = x + dx;
        const py = y + dy;
        if (px + r >= 0 && px - r <= size && py + r >= 0 && py - r <= size) draw(px, py);
      }
    }
  };

  // 잔 글리터
  for (let i = 0; i < 700; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.35 + rand() * 1.05;
    const hue = Math.floor(rand() * 360);
    const light = 62 + rand() * 30;
    const alpha = 0.45 + rand() * 0.55;
    wrapped(x, y, r, (px, py) => {
      ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 네 갈래 별빛
  for (let i = 0; i < 22; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 7;
    const hue = Math.floor(rand() * 360);
    wrapped(x, y, len, (px, py) => {
      const glow = ctx.createRadialGradient(px, py, 0, px, py, len);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.35, `hsla(${hue}, 100%, 80%, 0.5)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(px, py - len);
      ctx.quadraticCurveTo(px, py, px + len, py);
      ctx.quadraticCurveTo(px, py, px, py + len);
      ctx.quadraticCurveTo(px, py, px - len, py);
      ctx.quadraticCurveTo(px, py, px, py - len);
      ctx.fill();
    });
  }

  document.documentElement.style.setProperty('--sparkle-texture', `url("${canvas.toDataURL('image/png')}")`);
}
