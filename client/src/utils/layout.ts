import Phaser from 'phaser';

export interface Layout {
  isPortrait: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** min(width, height) */
  shortSide: number;
  /** max(width, height) */
  longSide: number;
  bgKey: 'bg-desktop' | 'bg-mobile';
  /** shortSide / 400 — generic UI scale factor */
  uiScale: number;
  /** Responsive font size: scales with shortSide, clamped to 65%–150% of base */
  fs: (base: number) => number;
  /** Base padding unit proportional to shortSide */
  pad: number;
  /** @deprecated use shortSide */
  vmin: number;
}

export function getLayout(w: number, h: number): Layout {
  const isPortrait = h > w;
  const shortSide = Math.min(w, h);
  const longSide  = Math.max(w, h);
  return {
    isPortrait,
    isLandscape: !isPortrait,
    width:  w,
    height: h,
    cx: w / 2,
    cy: h / 2,
    shortSide,
    longSide,
    bgKey: isPortrait ? 'bg-mobile' : 'bg-desktop',
    uiScale: shortSide / 400,
    fs: (base: number) => Math.max(base * 0.65, Math.min(base * 1.5, shortSide * base / 500)),
    pad: Math.max(12, shortSide * 0.025),
    vmin: shortSide,
  };
}

/** Scale image to cover the full w×h area without letterboxing. */
export function applyBgCover(img: Phaser.GameObjects.Image, w: number, h: number) {
  img.setPosition(w / 2, h / 2);
  img.setScale(Math.max(w / img.width, h / img.height));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
