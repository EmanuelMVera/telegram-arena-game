import Phaser from 'phaser';
import {
  getClientIdentity,
  getPlayerDisplayName,
  getSavedAvatarIndex,
  saveAvatarIndex,
  savePlayerAlias,
} from '../telegram/telegram';

export class MainMenuScene extends Phaser.Scene {
  private aliasText!: Phaser.GameObjects.Text;
  private avatarImage!: Phaser.GameObjects.Image;
  private avatarMaskCircle!: Phaser.GameObjects.Arc;
  private pickerObjects: Phaser.GameObjects.GameObject[] = [];
  private framesRegistered = false;

  constructor() { super('MainMenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.registerAvatarFrames();
    this.createBackground(width, height);
    this.createTitle(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
    this.createBottomBar(width, height);
  }

  // ── AVATAR FRAMES ───────────────────────────────────────────────────────────

  private registerAvatarFrames() {
    if (this.framesRegistered) return;
    const tex = this.textures.get('avatars');
    const src = tex.getSourceImage() as HTMLImageElement;
    const fw = Math.floor(src.width / 3);
    const fh = Math.floor(src.height / 3);
    for (let i = 0; i < 9; i++) {
      if (!tex.has(String(i))) {
        tex.add(String(i), 0, (i % 3) * fw, Math.floor(i / 3) * fh, fw, fh);
      }
    }
    this.framesRegistered = true;
  }

  // ── BACKGROUND ──────────────────────────────────────────────────────────────

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(w / 2, h / 2, 'loading-background')
      .setScale(Math.max(w / 1600, h / 900)).setDepth(-20);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6).setDepth(-10);
    this.drawFrameCorners(w, h);
    for (let i = 0; i < 26; i++) {
      const p = this.add.circle(
        Phaser.Math.Between(0, w), Phaser.Math.Between(0, h),
        Phaser.Math.FloatBetween(0.8, 2.4), 0x57eaff, Phaser.Math.FloatBetween(0.15, 0.5),
      ).setDepth(-3);
      this.tweens.add({
        targets: p, y: p.y - Phaser.Math.Between(50, 120), alpha: 0,
        duration: Phaser.Math.Between(2600, 5400), repeat: -1, delay: Phaser.Math.Between(0, 2800),
      });
    }
    this.tweens.add({ targets: bg, scale: bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(-4);
    g.lineStyle(1, 0x5ee8ff, 0.28);
    const m = 14, s = 20;
    g.lineBetween(m, m, m + s, m);         g.lineBetween(m, m, m, m + s);
    g.lineBetween(w - m, m, w - m - s, m); g.lineBetween(w - m, m, w - m, m + s);
    g.lineBetween(m, h - m, m + s, h - m); g.lineBetween(m, h - m, m, h - m - s);
    g.lineBetween(w - m, h - m, w - m - s, h - m); g.lineBetween(w - m, h - m, w - m, h - m - s);
  }

  // ── TITLE ───────────────────────────────────────────────────────────────────

  private createTitle(w: number, h: number) {
    const cx = w / 2;
    this.drawDiamond(cx, h * 0.058, 8, 0x5ee8ff, 0.9).setDepth(3);

    const g = this.add.graphics().setDepth(2);
    g.lineStyle(1, 0x5ee8ff, 0.45);
    g.lineBetween(cx - 70, h * 0.058, cx - 18, h * 0.058);
    g.lineBetween(cx + 18, h * 0.058, cx + 70, h * 0.058);

    const fs = Math.max(26, Math.round(Math.min(w * 0.075, h * 0.065)));
    this.add.text(cx, h * 0.095, 'ARENA\nBRAWLER 2D', {
      align: 'center', fontSize: `${fs}px`, color: '#a7f7ff',
      fontStyle: 'bold', lineSpacing: Math.round(fs * 0.18),
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 16).setDepth(3);

    const g2 = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.52, 290);
    g2.lineStyle(1, 0x72f7ff, 0.5);
    g2.lineBetween(cx - sepW / 2, h * 0.19, cx + sepW / 2, h * 0.19);
    this.drawDiamond(cx, h * 0.19, 4, 0x5ee8ff, 0.75).setDepth(2);
  }

  // ── PLAYER CARD ─────────────────────────────────────────────────────────────

  private createPlayerCard(w: number, h: number) {
    const identity = getClientIdentity();
    const cx = w / 2;
    const avatarCy = h * 0.30;
    const avatarR = Math.min(72, Math.round(h * 0.105));
    const panelW = Math.min(w * 0.84, 430);
    const panelH = Math.min(h * 0.38, 300);
    const panelCy = h * 0.42;

    this.add.rectangle(cx, panelCy, panelW, panelH, 0x020811, 0.42)
      .setStrokeStyle(1, 0x5ee8ff, 0.4).setDepth(4);

    // Avatar rings
    const ring = this.add.graphics().setDepth(5);
    ring.lineStyle(3, 0x6eeeff, 0.8);
    ring.strokeCircle(cx, avatarCy, avatarR + 10);
    ring.lineStyle(1, 0x6eeeff, 0.22);
    ring.strokeCircle(cx, avatarCy, avatarR + 17);
    this.add.circle(cx, avatarCy, avatarR, 0x08121e, 1).setDepth(5);

    // Circular mask
    this.avatarMaskCircle = this.add.arc(cx, avatarCy, avatarR, 0, 360, false, 0xffffff, 1)
      .setVisible(false).setDepth(5);
    const mask = this.avatarMaskCircle.createGeometryMask();

    // Local avatar from spritesheet (default)
    const savedIdx = getSavedAvatarIndex();
    this.avatarImage = this.add.image(cx, avatarCy, 'avatars', String(savedIdx))
      .setDisplaySize(avatarR * 2.5, avatarR * 2.5).setMask(mask).setDepth(6);
    this.add.circle(cx, avatarCy, avatarR + 2).setStrokeStyle(2, 0x8eefff, 0.8).setDepth(7);

    // Try Telegram photo on top (if available)
    if (identity.photoUrl) {
      const photoKey = `tg-avatar-${identity.id}`;
      if (this.textures.exists(photoKey)) {
        this.avatarImage.setTexture(photoKey).setFrame(0);
        this.avatarImage.setDisplaySize(avatarR * 2.5, avatarR * 2.5);
      } else {
        this.load.image(photoKey, identity.photoUrl);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
          if (this.textures.exists(photoKey) && this.avatarImage?.active) {
            this.avatarImage.setTexture(photoKey).setDisplaySize(avatarR * 2.5, avatarR * 2.5);
          }
        });
        this.load.start();
      }
    }

    // Name
    const nameFs = Math.max(24, Math.round(Math.min(w * 0.065, 40)));
    this.aliasText = this.add.text(cx, h * 0.497, getPlayerDisplayName(), {
      fontSize: `${nameFs}px`, color: '#e8feff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);

    // Edit alias button
    this.add.text(cx - panelW * 0.22, h * 0.548, '✎  Editar alias', {
      fontSize: '13px', color: '#8eefff', fontStyle: 'bold',
      backgroundColor: 'rgba(3,28,44,0.65)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const next = window.prompt('Ingresá tu alias de juego', getPlayerDisplayName());
        if (next === null) return;
        savePlayerAlias(next);
        this.aliasText.setText(getPlayerDisplayName());
      });

    // Change avatar button
    this.add.text(cx + panelW * 0.22, h * 0.548, '✎  Cambiar avatar', {
      fontSize: '13px', color: '#8eefff', fontStyle: 'bold',
      backgroundColor: 'rgba(3,28,44,0.65)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openAvatarPicker(avatarR));
  }

  // ── AVATAR PICKER ───────────────────────────────────────────────────────────

  private openAvatarPicker(avatarR: number) {
    if (this.pickerObjects.length > 0) return;

    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const currentIdx = getSavedAvatarIndex();

    // Overlay
    const overlay = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.78)
      .setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeAvatarPicker());

    // Panel
    const panelW = Math.min(w * 0.88, 400);
    const panelH = Math.min(h * 0.62, 480);
    const panel = this.add.rectangle(cx, h / 2, panelW, panelH, 0x040d1a, 0.97)
      .setStrokeStyle(1.5, 0x5ee8ff, 0.85).setDepth(26);

    // Header
    const header = this.add.text(cx, h / 2 - panelH / 2 + 30, 'ELEGÍ TU PERSONAJE', {
      fontSize: '13px', color: '#5ee8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(27);

    // 9 avatars in 3×3 grid
    const cellSize = Math.min((panelW - 48) / 3, (panelH - 120) / 3);
    const thumbR = Math.floor(cellSize * 0.44);
    const gridStartX = cx - cellSize;
    const gridStartY = h / 2 - panelH / 2 + 80 + cellSize / 2;

    const thumbMasks: Phaser.GameObjects.Arc[] = [];
    const borders: Phaser.GameObjects.Arc[] = [];

    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const tx = gridStartX + col * cellSize;
      const ty = gridStartY + row * cellSize;

      const borderColor = i === currentIdx ? 0x5ee8ff : 0x2a4a5e;
      const borderAlpha = i === currentIdx ? 1.0 : 0.5;
      const border = this.add.arc(tx, ty, thumbR + 3, 0, 360, false, borderColor, borderAlpha)
        .setDepth(27);
      borders.push(border);

      const maskArc = this.add.arc(tx, ty, thumbR, 0, 360, false, 0xffffff, 1)
        .setVisible(false).setDepth(27);
      thumbMasks.push(maskArc);
      const thumbMask = maskArc.createGeometryMask();

      const thumb = this.add.image(tx, ty, 'avatars', String(i))
        .setDisplaySize(thumbR * 2.5, thumbR * 2.5).setMask(thumbMask).setDepth(28)
        .setInteractive({ useHandCursor: true });

      thumb.on('pointerdown', () => {
        saveAvatarIndex(i);
        this.avatarImage.setTexture('avatars', String(i)).setDisplaySize(avatarR * 2.5, avatarR * 2.5);
        this.closeAvatarPicker();
      });
      thumb.on('pointerover', () => { if (i !== getSavedAvatarIndex()) border.setFillStyle(0x3a6a8a, 0.7); });
      thumb.on('pointerout',  () => { if (i !== getSavedAvatarIndex()) border.setFillStyle(0x2a4a5e, 0.5); });

      this.pickerObjects.push(border, maskArc, thumb);
    }

    // Close button
    const closeBtnY = h / 2 + panelH / 2 - 32;
    const closeBg = this.add.rectangle(cx, closeBtnY, 160, 36, 0x0d4d62, 0.97)
      .setStrokeStyle(1.5, 0x5ee8ff, 0.8).setDepth(27).setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(cx, closeBtnY, 'CERRAR', {
      fontSize: '13px', color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(28);
    closeBg.on('pointerover', () => closeBg.setFillStyle(0x145f78, 0.97));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(0x0d4d62, 0.97));
    closeBg.on('pointerdown', () => this.closeAvatarPicker());

    this.pickerObjects.push(overlay, panel, header, closeBg, closeTxt, ...borders, ...thumbMasks);
  }

  private closeAvatarPicker() {
    this.pickerObjects.forEach((o) => (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy());
    this.pickerObjects = [];
  }

  // ── MAIN BUTTONS ─────────────────────────────────────────────────────────────

  private createButtons(w: number, h: number) {
    const cx = w / 2;
    const btnW = Math.min(w * 0.82, 440);
    const btnH = Math.max(48, Math.round(h * 0.088));
    const startY = h * 0.645;
    const spacing = Math.min(76, Math.round((h * 0.945 - startY) / 2.5));

    const defs: { label: string; icon: 'swords' | 'join'; highlight: boolean; mode: 'create' | 'join' }[] = [
      { label: 'CREAR PARTIDA',    icon: 'swords', highlight: false, mode: 'create' },
      { label: 'UNIRSE A PARTIDA', icon: 'join',   highlight: true,  mode: 'join'   },
    ];

    defs.forEach(({ label, icon, highlight, mode }, idx) => {
      const by = startY + idx * spacing;
      const fillColor = highlight ? 0x0d4d62 : 0x060f1a;
      const borderAlpha = highlight ? 1.0 : 0.8;
      const borderPx = highlight ? 2.5 : 1.5;

      const bg = this.add.rectangle(cx, by, btnW, btnH, fillColor, 0.97)
        .setStrokeStyle(borderPx, 0x5ee8ff, borderAlpha).setDepth(8);

      const bG = this.add.graphics().setDepth(9);
      bG.lineStyle(1, 0x5ee8ff, highlight ? 0.75 : 0.45);
      const brkH = btnH * 0.44;
      const bL = cx - btnW / 2 + 16, bR = cx + btnW / 2 - 16;
      bG.lineBetween(bL, by - brkH / 2, bL, by + brkH / 2);
      bG.lineBetween(bL, by - brkH / 2, bL + 6, by - brkH / 2);
      bG.lineBetween(bL, by + brkH / 2, bL + 6, by + brkH / 2);
      bG.lineBetween(bR, by - brkH / 2, bR, by + brkH / 2);
      bG.lineBetween(bR, by - brkH / 2, bR - 6, by - brkH / 2);
      bG.lineBetween(bR, by + brkH / 2, bR - 6, by + brkH / 2);

      this.drawButtonIcon(icon, cx - btnW / 2 + 40, by, 7, highlight).setDepth(9);

      const fs = Math.max(16, Math.round(Math.min(w * 0.037, 22)));
      const txt = this.add.text(cx + 10, by, label, {
        fontSize: `${fs}px`, color: highlight ? '#d4fbff' : '#bef0ff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(9);

      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(highlight ? 0x145f78 : 0x0a1d2c, 0.97))
        .on('pointerout',  () => bg.setFillStyle(fillColor, 0.97))
        .on('pointerdown', () => {
          this.tweens.add({ targets: [bg, txt], alpha: 0.65, yoyo: true, duration: 90 });
          this.cameras.main.fadeOut(320, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () =>
            this.scene.start('CreateJoinScene', { mode }),
          );
        });
    });
  }

  private createBottomBar(w: number, h: number) {
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(1, 0x5ee8ff, 0.18);
    g.lineBetween(w * 0.05, h - 42, w * 0.95, h - 42);
    this.add.text(w * 0.06, h - 24, 'ÚNETE A LA COMUNIDAD', {
      fontSize: '11px', color: '#4ac6d8',
    }).setOrigin(0, 0.5).setDepth(11);
    this.add.text(w - 14, h - 24, 'v0.1.0', {
      fontSize: '11px', color: '#3a9baf',
    }).setOrigin(1, 0.5).setDepth(11);
  }

  private drawDiamond(x: number, y: number, size: number, color: number, alpha = 1) {
    const g = this.add.graphics();
    g.fillStyle(color, alpha);
    g.fillTriangle(x, y - size, x + size * 0.65, y, x - size * 0.65, y);
    g.fillTriangle(x, y + size, x + size * 0.65, y, x - size * 0.65, y);
    return g;
  }

  private drawButtonIcon(type: 'swords' | 'join' | 'arena', x: number, y: number, s: number, bright: boolean) {
    const g = this.add.graphics();
    const c = bright ? 0x8ef8ff : 0x5ee8ff;
    const a = bright ? 0.95 : 0.8;
    g.lineStyle(1.5, c, a);
    if (type === 'swords') {
      g.lineBetween(x - s, y - s, x + s, y + s); g.lineBetween(x + s, y - s, x - s, y + s);
      g.fillStyle(c, a); g.fillCircle(x - s * 0.9, y - s * 0.9, 2.5); g.fillCircle(x + s * 0.9, y + s * 0.9, 2.5);
    } else if (type === 'join') {
      g.fillStyle(c, a); g.fillCircle(x - s, y, s * 0.48); g.fillCircle(x + s, y, s * 0.48);
      g.lineBetween(x - s * 0.52, y, x + s * 0.52, y);
    } else {
      g.fillStyle(c, a * 0.3);
      g.fillTriangle(x, y - s, x + s, y, x - s, y); g.fillTriangle(x, y + s, x + s, y, x - s, y);
      g.lineStyle(1.5, c, a);
      g.lineBetween(x, y - s, x + s, y); g.lineBetween(x + s, y, x, y + s);
      g.lineBetween(x, y + s, x - s, y); g.lineBetween(x - s, y, x, y - s);
    }
    return g;
  }
}
