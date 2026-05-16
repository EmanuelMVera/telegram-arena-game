import Phaser from 'phaser';

export interface Layout {
  isPortrait: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
  cx: number;
  cy: number;
  centerX: number;
  centerY: number;
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
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
  fontScale: number;
  buttonScale: number;
  headerBounds: { x: number; y: number; width: number; height: number };
  contentBounds: { x: number; y: number; width: number; height: number };
  actionBounds: { x: number; y: number; width: number; height: number };
  footerBounds: { x: number; y: number; width: number; height: number };
  /** @deprecated use shortSide */
  vmin: number;
}

export function getLayout(w: number, h: number): Layout {
  const safeTop = readSafeInset('top');
  const safeBottom = readSafeInset('bottom');
  const safeLeft = readSafeInset('left');
  const safeRight = readSafeInset('right');
  const isPortrait = h > w;
  const shortSide = Math.min(w, h);
  const longSide  = Math.max(w, h);
  const usableX = safeLeft;
  const usableY = safeTop;
  const usableW = Math.max(1, w - safeLeft - safeRight);
  const usableH = Math.max(1, h - safeTop - safeBottom);
  const headerH = Math.round(usableH * (isPortrait ? 0.18 : 0.20));
  const footerH = Math.round(usableH * 0.08);
  const actionH = Math.round(usableH * (isPortrait ? 0.24 : 0.40));
  const contentH = Math.max(1, usableH - headerH - actionH - footerH);
  return {
    isPortrait,
    isLandscape: !isPortrait,
    width:  w,
    height: h,
    cx: w / 2,
    cy: h / 2,
    centerX: w / 2,
    centerY: h / 2,
    shortSide,
    longSide,
    bgKey: isPortrait ? 'bg-mobile' : 'bg-desktop',
    uiScale: shortSide / 400,
    fontScale: shortSide / 500,
    buttonScale: shortSide / 460,
    fs: (base: number) => Math.max(base * 0.65, Math.min(base * 1.5, shortSide * base / 500)),
    pad: Math.max(12, shortSide * 0.025),
    safeTop,
    safeBottom,
    safeLeft,
    safeRight,
    headerBounds: { x: usableX, y: usableY, width: usableW, height: headerH },
    contentBounds: { x: usableX, y: usableY + headerH, width: usableW, height: contentH },
    actionBounds: { x: usableX, y: usableY + headerH + contentH, width: usableW, height: actionH },
    footerBounds: { x: usableX, y: usableY + headerH + contentH + actionH, width: usableW, height: footerH },
    vmin: shortSide,
  };
}

function readSafeInset(side: 'top' | 'bottom' | 'left' | 'right'): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--safe-area-${side}`)
    .trim();
  const n = Number.parseFloat(value || '0');
  return Number.isFinite(n) ? n : 0;
}

/** Scale image to cover the full w×h area without letterboxing. */
export function applyBgCover(img: Phaser.GameObjects.Image, w: number, h: number) {
  img.setPosition(w / 2, h / 2);
  img.setScale(Math.max(w / img.width, h / img.height));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
