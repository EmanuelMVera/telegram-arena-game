import Phaser from 'phaser';

export interface Layout {
  isPortrait: boolean;
  cx: number;
  cy: number;
  bgKey: 'bg-desktop' | 'bg-mobile';
  vmin: number;
  /** Responsive font size: scales with viewport, clamped between 65%–150% of base */
  fs: (base: number) => number;
  /** Base padding unit, proportional to vmin */
  pad: number;
}

export function getLayout(w: number, h: number): Layout {
  const isPortrait = h > w;
  const vmin = Math.min(w, h);
  return {
    isPortrait,
    cx: w / 2,
    cy: h / 2,
    bgKey: isPortrait ? 'bg-mobile' : 'bg-desktop',
    vmin,
    fs: (base: number) => Math.max(base * 0.65, Math.min(base * 1.5, vmin * base / 500)),
    pad: Math.max(12, vmin * 0.025),
  };
}

/** Scale image to cover the full w×h area (no letterboxing). */
export function applyBgCover(img: Phaser.GameObjects.Image, w: number, h: number) {
  img.setPosition(w / 2, h / 2);
  img.setScale(Math.max(w / img.width, h / img.height));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
