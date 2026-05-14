import Phaser from 'phaser';
import type { ClientIdentity } from '../types/player';

/** Deterministic color from a player id string. */
function colorForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  const palette = [0x1a4d7a, 0x2d6b4a, 0x7a2d1a, 0x4a2d7a, 0x1a6b6b, 0x6b4a1a];
  return palette[Math.abs(h) % palette.length];
}

/** Up to 2 uppercase initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Creates a circular avatar at (x, y) with radius `r`.
 *
 * Priority:
 *   1. Telegram photo (if `identity.photoUrl` — loads async, replaces initials on success)
 *   2. Initials on a colored circle (immediate fallback)
 *
 * Returns an object with `objects` (all GameObjects created, for depth/destroy management)
 * and `setDepth(n)` convenience.
 */
export function buildAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  identity: ClientIdentity,
  depth = 6,
): { objects: Phaser.GameObjects.GameObject[]; setDepth: (d: number) => void } {
  const objects: Phaser.GameObjects.GameObject[] = [];

  // Circular geometry mask
  const maskG = scene.add.graphics().setAlpha(0);
  maskG.fillStyle(0xffffff).fillCircle(x, y, r);
  const mask = maskG.createGeometryMask();
  objects.push(maskG);

  // Initials background circle
  const bgG = scene.add.graphics().setDepth(depth);
  bgG.fillStyle(colorForId(identity.id)).fillCircle(x, y, r);
  bgG.setMask(mask);
  objects.push(bgG);

  // Initials text (centered)
  const txtSize = Math.max(12, Math.round(r * 0.72));
  const txt = scene.add.text(x, y, initials(identity.name), {
    fontSize: `${txtSize}px`, color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(depth + 0.1);
  objects.push(txt);

  // Photo overlay (replaces initials when loaded)
  let photoImg: Phaser.GameObjects.Image | null = null;

  if (identity.photoUrl) {
    const photoKey = `tg-photo-${identity.id}`;

    const applyPhoto = () => {
      if (!scene.textures.exists(photoKey) || !scene.scene.isActive()) return;
      if (photoImg) return; // already applied
      photoImg = scene.add.image(x, y, photoKey)
        .setDisplaySize(r * 2, r * 2)
        .setMask(mask)
        .setDepth(depth + 0.2);
      objects.push(photoImg);
      bgG.setVisible(false);
      txt.setVisible(false);
    };

    if (scene.textures.exists(photoKey)) {
      applyPhoto();
    } else {
      scene.load.image(photoKey, identity.photoUrl);
      scene.load.once(Phaser.Loader.Events.FILE_COMPLETE, (_key: string) => {
        if (_key === photoKey) applyPhoto();
      });
      scene.load.once(Phaser.Loader.Events.COMPLETE, applyPhoto);
      scene.load.start();
    }
  }

  const setDepth = (d: number) => {
    bgG.setDepth(d);
    txt.setDepth(d + 0.1);
    photoImg?.setDepth(d + 0.2);
  };

  return { objects, setDepth };
}
