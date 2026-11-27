export const SAMPLE_SCENE_NAMES = ['tree', 'sunset', 'orbs'] as const;
export type SampleSceneName = (typeof SAMPLE_SCENE_NAMES)[number];

export const SAMPLE_SCENES: ReadonlyArray<{ key: SampleSceneName; label: string }> = [
  { key: 'tree', label: 'Tree' },
  { key: 'sunset', label: 'Sunset' },
  { key: 'orbs', label: 'Orbs' },
];

/**
 * Render one of the 3 procedural sample scenes onto an offscreen 320 x 240
 * canvas. Pure drawing code; the caller extracts pixels through the UI image
 * loader before handing them to the engine.
 */
export function renderSampleScene(name: SampleSceneName): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (name === 'tree') {
    const bg = ctx.createRadialGradient(160, 120, 20, 160, 120, 210);
    bg.addColorStop(0, '#121a24');
    bg.addColorStop(1, '#050608');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 240);

    ctx.fillStyle = '#7c4a26';
    ctx.fillRect(142, 184, 36, 44);

    [
      { yTop: 28, yBot: 105, hw: 66, col: '#22c55e' },
      { yTop: 74, yBot: 152, hw: 92, col: '#16a34a' },
      { yTop: 120, yBot: 196, hw: 118, col: '#15803d' },
    ].forEach((tier) => {
      ctx.beginPath();
      ctx.moveTo(160, tier.yTop);
      ctx.lineTo(160 - tier.hw, tier.yBot);
      ctx.lineTo(160 + tier.hw, tier.yBot);
      ctx.closePath();
      ctx.fillStyle = tier.col;
      ctx.fill();
    });

    const glow = (x: number, y: number, radius: number, inner: string): void => {
      const gradient = ctx.createRadialGradient(x, y, 2, x, y, radius);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.35, inner);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    glow(160, 28, 28, '#fde047');
    (
      [
        [135, 84, '#facc15'],
        [184, 92, '#ef4444'],
        [156, 118, '#38bdf8'],
        [116, 138, '#ef4444'],
        [200, 142, '#facc15'],
        [146, 164, '#facc15'],
        [184, 174, '#38bdf8'],
        [98, 180, '#fde047'],
        [222, 180, '#ef4444'],
      ] as const
    ).forEach(([x, y, col]) => glow(x, y, 17, col));
  } else if (name === 'sunset') {
    const sky = ctx.createLinearGradient(0, 0, 0, 165);
    sky.addColorStop(0, '#0f0c29');
    sky.addColorStop(0.45, '#6b21a8');
    sky.addColorStop(0.8, '#ec4899');
    sky.addColorStop(1, '#fb923c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 320, 165);

    const sun = ctx.createLinearGradient(0, 50, 0, 155);
    sun.addColorStop(0, '#fef08a');
    sun.addColorStop(0.6, '#fb923c');
    sun.addColorStop(1, '#f43f5e');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(160, 118, 56, 0, Math.PI * 2);
    ctx.fill();

    const sea = ctx.createLinearGradient(0, 165, 0, 240);
    sea.addColorStop(0, '#1e1b4b');
    sea.addColorStop(1, '#09090b');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 165, 320, 75);

    ctx.fillStyle = 'rgba(251,146,60,0.75)';
    ctx.fillRect(118, 170, 84, 8);
    ctx.fillStyle = 'rgba(244,63,94,0.55)';
    ctx.fillRect(130, 186, 60, 8);
  } else {
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, 320, 240);
    ctx.globalCompositeOperation = 'lighter';
    (
      [
        [125, 102, '#ff2a2a'],
        [195, 102, '#22e544'],
        [160, 156, '#2e74ff'],
      ] as const
    ).forEach(([x, y, col]) => {
      const gradient = ctx.createRadialGradient(x, y, 8, x, y, 78);
      gradient.addColorStop(0, col);
      gradient.addColorStop(0.7, col);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 78, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}
