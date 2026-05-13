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
  private pickerObjects: Phaser.GameObjects.GameObject[] = [];
  private framesRegistered = false;
  constructor() { super('MainMenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.registerAvatarFrames();
    this.createBackground(width, height);
    this.createVignette(width, height);
    this.createTitle(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
    this.createBottomBar(width, height);
  }

  // ── AVATAR FRAMES ────────────────────────────────────────────────────────────

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

  // ── BACKGROUND ───────────────────────────────────────────────────────────────

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(w / 2, h / 2, 'loading-background')
      .setScale(Math.max(w / 1600, h / 900)).setDepth(-20);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55).setDepth(-10);
    this.drawFrameCorners(w, h);

    // Ambient floating particles (varied colors)
    const colors = [0x57eaff, 0x8ef8ff, 0x2dd7e6, 0xb0f4ff];
    for (let i = 0; i < 34; i++) {
      const r = Phaser.Math.FloatBetween(0.6, 2.8);
      const a = Phaser.Math.FloatBetween(0.10, 0.55);
      const color = Phaser.Math.RND.pick(colors);
      const startY = Phaser.Math.Between(Math.floor(h * 0.5), h);
      const p = this.add.circle(Phaser.Math.Between(0, w), startY, r, color, a).setDepth(-3);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(50, 140),
        x: p.x + Phaser.Math.Between(-22, 22),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6500),
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        onRepeat: () => {
          p.x = Phaser.Math.Between(0, w);
          p.y = Phaser.Math.Between(Math.floor(h * 0.5), h);
          p.alpha = a;
        },
      });
    }

    // Subtle horizontal scan line
    const scan = this.add.rectangle(w / 2, h * 0.15, w, 1, 0x5ee8ff, 0.025).setDepth(-5);
    this.tweens.add({ targets: scan, y: h + 10, duration: 8000, repeat: -1, ease: 'Linear', delay: 800 });

    this.tweens.add({ targets: bg, scale: bg.scale * 1.025, duration: 12000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private createVignette(w: number, h: number) {
    const g = this.add.graphics().setDepth(-6);
    for (let i = 10; i >= 1; i--) {
      const t = i / 10;
      const a = 0.09 * t * t;
      g.fillStyle(0x000000, a);
      g.fillRect(0, 0, w * 0.26 * t, h);
      g.fillRect(w - w * 0.26 * t, 0, w * 0.26 * t, h);
      g.fillRect(0, 0, w, h * 0.20 * t);
      g.fillRect(0, h - h * 0.20 * t, w, h * 0.20 * t);
    }
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(-4);
    g.lineStyle(1, 0x5ee8ff, 0.30);
    const m = 14, s = 22;
    ([[m, m], [w - m, m], [m, h - m], [w - m, h - m]] as [number, number][]).forEach(([x, y]) => {
      const sx = x === m ? 1 : -1, sy = y === m ? 1 : -1;
      g.lineBetween(x, y, x + sx * s, y);
      g.lineBetween(x, y, x, y + sy * s);
      g.fillStyle(0x5ee8ff, 0.55);
      g.fillRect(x - 1, y - 1, 2, 2);
    });
  }

  // ── TITLE ─────────────────────────────────────────────────────────────────────

  private createTitle(w: number, h: number) {
    const cx = w / 2;
    this.drawDiamond(cx, h * 0.055, 9, 0x5ee8ff, 0.95).setDepth(3);

    const g = this.add.graphics().setDepth(2);
    g.lineStyle(1, 0x5ee8ff, 0.5);
    g.lineBetween(cx - 78, h * 0.055, cx - 20, h * 0.055);
    g.lineBetween(cx + 20, h * 0.055, cx + 78, h * 0.055);

    const fs = Math.max(26, Math.round(Math.min(w * 0.075, h * 0.065)));
    this.add.text(cx, h * 0.095, 'ARENA\nBRAWLER 2D', {
      align: 'center', fontSize: `${fs}px`, color: '#c2f8ff',
      fontStyle: 'bold', lineSpacing: Math.round(fs * 0.18),
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 20).setDepth(3);

    const g2 = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.52, 300);
    g2.lineStyle(1, 0x5ee8ff, 0.40);
    g2.lineBetween(cx - sepW / 2, h * 0.19, cx - 8, h * 0.19);
    g2.lineBetween(cx + 8, h * 0.19, cx + sepW / 2, h * 0.19);
    this.drawDiamond(cx, h * 0.19, 4, 0x5ee8ff, 0.80).setDepth(2);
  }

  // ── PLAYER CARD ───────────────────────────────────────────────────────────────

  private createPlayerCard(w: number, h: number) {
    const identity = getClientIdentity();
    const cx = w / 2;
    const avatarR = Math.min(68, Math.round(Math.min(w * 0.115, h * 0.095)));
    const avatarCy = h * 0.31;
    const panelW = Math.min(w * 0.86, 440);
    const panelH = Math.min(h * 0.43, 320);
    const panelCy = h * 0.435;

    // ── Rounded card panel ───────────────────────────────────────────────────
    const panelG = this.add.graphics().setDepth(4);
    panelG.fillStyle(0x020c18, 0.88);
    panelG.fillRoundedRect(cx - panelW / 2, panelCy - panelH / 2, panelW, panelH, 9);
    panelG.lineStyle(1, 0x5ee8ff, 0.45);
    panelG.strokeRoundedRect(cx - panelW / 2, panelCy - panelH / 2, panelW, panelH, 9);
    // Inner top highlight
    panelG.lineStyle(1, 0xaaf5ff, 0.10);
    panelG.lineBetween(cx - panelW / 2 + 18, panelCy - panelH / 2 + 2, cx + panelW / 2 - 18, panelCy - panelH / 2 + 2);

    // ── Multi-layer avatar glow (behind everything) ──────────────────────────
    const glowG = this.add.graphics().setDepth(4);
    ([{ r: avatarR + 32, a: 0.035 }, { r: avatarR + 21, a: 0.065 }, { r: avatarR + 12, a: 0.11 }]).forEach(({ r, a }) => {
      glowG.fillStyle(0x5ee8ff, a);
      glowG.fillCircle(cx, avatarCy, r);
    });

    // ── Rotating dashed outer ring ───────────────────────────────────────────
    const dashRingG = this.add.graphics().setDepth(5);
    const dashes = 10, ringR = avatarR + 20;
    for (let i = 0; i < dashes; i++) {
      const sa = (i / dashes) * Math.PI * 2;
      const ea = sa + (0.52 / dashes) * Math.PI * 2;
      dashRingG.lineStyle(1.5, 0x5ee8ff, 0.55);
      dashRingG.beginPath();
      dashRingG.arc(cx, avatarCy, ringR, sa, ea, false);
      dashRingG.strokePath();
    }
    this.tweens.add({ targets: dashRingG, angle: 360, duration: 9000, repeat: -1, ease: 'Linear' });

    // Pulsing solid inner ring
    const solidRing = this.add.graphics().setDepth(5);
    solidRing.lineStyle(2.5, 0x5ee8ff, 0.80);
    solidRing.strokeCircle(cx, avatarCy, avatarR + 7);
    this.tweens.add({ targets: solidRing, alpha: { from: 0.45, to: 1.0 }, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Dark bg fill so the glow doesn't bleed into transparent avatar corners
    this.add.circle(cx, avatarCy, avatarR + 1, 0x030e1a, 1).setDepth(5);

    // ── Circular mask (add.graphics + setAlpha(0) — fully reliable) ─────────
    const maskG = this.add.graphics().setAlpha(0).setDepth(0);
    maskG.fillStyle(0xffffff);
    maskG.fillCircle(cx, avatarCy, avatarR);
    const mask = maskG.createGeometryMask();

    // ── Avatar image (3.2× scale so artwork fills the circle) ───────────────
    const savedIdx = getSavedAvatarIndex();
    this.avatarImage = this.add.image(cx, avatarCy, 'avatars', String(savedIdx))
      .setDisplaySize(avatarR * 3.2, avatarR * 3.2).setMask(mask).setDepth(6);

    // ── Rim lights drawn above avatar ────────────────────────────────────────
    const rimG = this.add.graphics().setDepth(7);
    rimG.lineStyle(2, 0x5ee8ff, 1.0);
    rimG.strokeCircle(cx, avatarCy, avatarR + 1);
    rimG.lineStyle(1, 0xd4fbff, 0.30);
    rimG.strokeCircle(cx, avatarCy, avatarR - 2);

    // ── Orbiting dots ────────────────────────────────────────────────────────
    const orbitR = avatarR + 20;
    const numDots = 7;
    const orbitState = { angle: 0 };
    const orbitDots = Array.from({ length: numDots }, (_, i) => {
      const a = (i / numDots) * Math.PI * 2;
      const big = i % 3 === 0;
      return this.add.arc(
        cx + Math.cos(a) * orbitR,
        avatarCy + Math.sin(a) * orbitR,
        big ? 3.0 : 1.8,
        0, 360, false,
        big ? 0x8ef8ff : 0x5ee8ff,
        big ? 0.9 : 0.5,
      ).setDepth(8);
    });
    this.tweens.add({
      targets: orbitState,
      angle: Math.PI * 2,
      duration: 5800,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        orbitDots.forEach((dot, i) => {
          const a = orbitState.angle + (i / numDots) * Math.PI * 2;
          dot.setPosition(cx + Math.cos(a) * orbitR, avatarCy + Math.sin(a) * orbitR);
          dot.setAlpha(0.25 + 0.72 * ((1 + Math.sin(a * 2 + i)) / 2));
        });
      },
    });

    // ── Telegram photo (loads on top of local avatar if available) ───────────
    if (identity.photoUrl) {
      const photoKey = `tg-avatar-${identity.id}`;
      if (this.textures.exists(photoKey)) {
        this.avatarImage.setTexture(photoKey).setDisplaySize(avatarR * 3.2, avatarR * 3.2);
      } else {
        this.load.image(photoKey, identity.photoUrl);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
          if (this.textures.exists(photoKey) && this.avatarImage?.active) {
            this.avatarImage.setTexture(photoKey).setDisplaySize(avatarR * 3.2, avatarR * 3.2);
          }
        });
        this.load.start();
      }
    }

    // ── Player name ──────────────────────────────────────────────────────────
    const nameFs = Math.max(22, Math.round(Math.min(w * 0.062, 38)));
    this.aliasText = this.add.text(cx, h * 0.510, getPlayerDisplayName(), {
      fontSize: `${nameFs}px`, color: '#e8feff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 10).setDepth(6);

    // Separator + diamond under name
    const sepW2 = Math.min(w * 0.32, 140);
    const sepY = h * 0.549;
    const sepG = this.add.graphics().setDepth(5);
    sepG.lineStyle(1, 0x5ee8ff, 0.20);
    sepG.lineBetween(cx - sepW2 / 2, sepY, cx + sepW2 / 2, sepY);
    this.drawDiamond(cx, sepY, 3, 0x5ee8ff, 0.55).setDepth(5);

    // ── Action buttons (rounded via Graphics + transparent hit Rectangle) ────
    const btnY = h * 0.577;
    const halfGap = Math.min(panelW * 0.22, 100);
    const aBtnW = Math.min(panelW * 0.38, 148);
    const aBtnH = 32;

    const actionDefs = [
      {
        x: cx - halfGap,
        label: '✎  Alias',
        action: () => {
          const next = window.prompt('Alias de juego', getPlayerDisplayName());
          if (next === null) return;
          savePlayerAlias(next);
          this.aliasText.setText(getPlayerDisplayName());
        },
      },
      {
        x: cx + halfGap,
        label: '◈  Avatar',
        action: () => this.openAvatarPicker(avatarR),
      },
    ];

    actionDefs.forEach(({ x, label, action }) => {
      const abG = this.add.graphics().setDepth(6);
      const drawABtn = (hover: boolean) => {
        abG.clear();
        abG.fillStyle(hover ? 0x143d54 : 0x081824, hover ? 0.97 : 0.88);
        abG.fillRoundedRect(x - aBtnW / 2, btnY - aBtnH / 2, aBtnW, aBtnH, 7);
        abG.lineStyle(1, 0x5ee8ff, hover ? 0.80 : 0.38);
        abG.strokeRoundedRect(x - aBtnW / 2, btnY - aBtnH / 2, aBtnW, aBtnH, 7);
        if (hover) {
          abG.lineStyle(1, 0xaaf5ff, 0.14);
          abG.lineBetween(x - aBtnW / 2 + 10, btnY - aBtnH / 2 + 1.5, x + aBtnW / 2 - 10, btnY - aBtnH / 2 + 1.5);
        }
      };
      drawABtn(false);
      const abTxt = this.add.text(x, btnY, label, {
        fontSize: '12px', color: '#8eefff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(7);
      const abHit = this.add.rectangle(x, btnY, aBtnW, aBtnH).setDepth(8).setInteractive({ useHandCursor: true });
      abHit.on('pointerover', () => { drawABtn(true); abTxt.setColor('#d4fbff'); });
      abHit.on('pointerout',  () => { drawABtn(false); abTxt.setColor('#8eefff'); });
      abHit.on('pointerdown', action);
    });
  }

  // ── AVATAR PICKER ─────────────────────────────────────────────────────────────

  private openAvatarPicker(avatarR: number) {
    if (this.pickerObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const currentIdx = getSavedAvatarIndex();

    // Backdrop
    const overlay = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.82)
      .setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeAvatarPicker());

    // Rounded panel
    const panelW = Math.min(w * 0.90, 400);
    const panelH = Math.min(h * 0.66, 510);
    const panelG = this.add.graphics().setDepth(26);
    panelG.fillStyle(0x030e1a, 0.97);
    panelG.fillRoundedRect(cx - panelW / 2, h / 2 - panelH / 2, panelW, panelH, 10);
    panelG.lineStyle(1.5, 0x5ee8ff, 0.80);
    panelG.strokeRoundedRect(cx - panelW / 2, h / 2 - panelH / 2, panelW, panelH, 10);
    panelG.lineStyle(1, 0xaaf5ff, 0.10);
    panelG.lineBetween(cx - panelW / 2 + 18, h / 2 - panelH / 2 + 2, cx + panelW / 2 - 18, h / 2 - panelH / 2 + 2);

    const header = this.add.text(cx, h / 2 - panelH / 2 + 28, 'ELEGÍ TU PERSONAJE', {
      fontSize: '13px', color: '#5ee8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 8).setDepth(27);

    // 3×3 grid
    const cellSize = Math.min((panelW - 44) / 3, (panelH - 120) / 3);
    const thumbR = Math.floor(cellSize * 0.44);
    const gridStartX = cx - cellSize;
    const gridStartY = h / 2 - panelH / 2 + 82 + cellSize / 2;

    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const tx = gridStartX + col * cellSize;
      const ty = gridStartY + row * cellSize;

      // Selected border fill
      const borderG = this.add.graphics().setDepth(27);
      const drawBorder = (selected: boolean, hover: boolean) => {
        borderG.clear();
        if (selected)     { borderG.fillStyle(0x5ee8ff, 1.0);   borderG.fillCircle(tx, ty, thumbR + 4); }
        else if (hover)   { borderG.fillStyle(0x3a7a9a, 0.75);  borderG.fillCircle(tx, ty, thumbR + 4); }
        else              { borderG.fillStyle(0x18384e, 0.65);   borderG.fillCircle(tx, ty, thumbR + 4); }
      };
      drawBorder(i === currentIdx, false);

      // Dark bg inside border
      const bgCirc = this.add.circle(tx, ty, thumbR + 1, 0x030e1a, 1).setDepth(27);

      // Mask
      const mG = this.add.graphics().setAlpha(0).setDepth(0);
      mG.fillStyle(0xffffff);
      mG.fillCircle(tx, ty, thumbR);
      const tMask = mG.createGeometryMask();

      // Thumbnail
      const thumb = this.add.image(tx, ty, 'avatars', String(i))
        .setDisplaySize(thumbR * 3.2, thumbR * 3.2).setMask(tMask).setDepth(28)
        .setInteractive({ useHandCursor: true });

      // Rim above thumb
      const rimG = this.add.graphics().setDepth(29);
      rimG.lineStyle(1.5, i === currentIdx ? 0x5ee8ff : 0x2a5a70, i === currentIdx ? 0.95 : 0.4);
      rimG.strokeCircle(tx, ty, thumbR + 1);

      thumb.on('pointerdown', () => {
        saveAvatarIndex(i);
        this.avatarImage.setTexture('avatars', String(i))
          .setDisplaySize(avatarR * 3.2, avatarR * 3.2);
        this.closeAvatarPicker();
      });
      thumb.on('pointerover', () => { if (i !== getSavedAvatarIndex()) drawBorder(false, true); });
      thumb.on('pointerout',  () => { if (i !== getSavedAvatarIndex()) drawBorder(false, false); });

      this.pickerObjects.push(borderG, bgCirc, mG, thumb, rimG);
    }

    // Close button (rounded)
    const closeBtnY = h / 2 + panelH / 2 - 34;
    const closeG = this.add.graphics().setDepth(27);
    const drawClose = (hover: boolean) => {
      closeG.clear();
      closeG.fillStyle(hover ? 0x145f78 : 0x0d4d62, 0.97);
      closeG.fillRoundedRect(cx - 80, closeBtnY - 18, 160, 36, 8);
      closeG.lineStyle(1.5, 0x5ee8ff, 0.80);
      closeG.strokeRoundedRect(cx - 80, closeBtnY - 18, 160, 36, 8);
    };
    drawClose(false);
    const closeTxt = this.add.text(cx, closeBtnY, 'CERRAR', {
      fontSize: '13px', color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(28);
    const closeHit = this.add.rectangle(cx, closeBtnY, 160, 36).setDepth(29).setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => drawClose(true));
    closeHit.on('pointerout',  () => drawClose(false));
    closeHit.on('pointerdown', () => this.closeAvatarPicker());

    this.pickerObjects.push(overlay, panelG, header, closeG, closeTxt, closeHit);
  }

  private closeAvatarPicker() {
    this.pickerObjects.forEach((o) => (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy());
    this.pickerObjects = [];
  }

  // ── MAIN BUTTONS ──────────────────────────────────────────────────────────────

  private createButtons(w: number, h: number) {
    const cx = w / 2;
    const btnW = Math.min(w * 0.82, 440);
    const btnH = Math.max(50, Math.round(h * 0.088));
    const startY = h * 0.650;
    const spacing = Math.min(76, Math.round((h * 0.94 - startY) / 2.5));
    const r = 7;

    const defs: { label: string; icon: 'swords' | 'join'; highlight: boolean; mode: 'create' | 'join' }[] = [
      { label: 'CREAR PARTIDA',    icon: 'swords', highlight: false, mode: 'create' },
      { label: 'UNIRSE A PARTIDA', icon: 'join',   highlight: true,  mode: 'join'   },
    ];

    defs.forEach(({ label, icon, highlight, mode }, idx) => {
      const by = startY + idx * spacing;
      const fill0 = highlight ? 0x0d4d62 : 0x060f1a;
      const fill1 = highlight ? 0x145f78 : 0x0a1d2c;
      const bA0 = highlight ? 1.0 : 0.75;
      const bPx = highlight ? 2 : 1.5;

      const bg = this.add.graphics().setDepth(8);
      const drawBg = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(hover ? fill1 : fill0, 0.97);
        bg.fillRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, r);
        bg.lineStyle(bPx, 0x5ee8ff, hover ? 1.0 : bA0);
        bg.strokeRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, r);
        // Top inner shimmer
        bg.lineStyle(1, 0xaaf5ff, hover ? 0.16 : (highlight ? 0.08 : 0));
        if (hover || highlight) {
          bg.lineBetween(cx - btnW / 2 + r + 4, by - btnH / 2 + 2, cx + btnW / 2 - r - 4, by - btnH / 2 + 2);
        }
      };
      drawBg(false);

      // Bracket decorations
      const bG = this.add.graphics().setDepth(9);
      bG.lineStyle(1, 0x5ee8ff, highlight ? 0.70 : 0.40);
      const brkH = btnH * 0.42;
      const bL = cx - btnW / 2 + 18, bR = cx + btnW / 2 - 18;
      [[bL, 8], [bR, -8]].forEach(([bx, dx]) => {
        bG.lineBetween(bx, by - brkH / 2, bx, by + brkH / 2);
        bG.lineBetween(bx, by - brkH / 2, bx + dx, by - brkH / 2);
        bG.lineBetween(bx, by + brkH / 2, bx + dx, by + brkH / 2);
      });

      this.drawButtonIcon(icon, cx - btnW / 2 + 44, by, 7, highlight).setDepth(9);

      const fs = Math.max(16, Math.round(Math.min(w * 0.037, 22)));
      const txt = this.add.text(cx + 12, by, label, {
        fontSize: `${fs}px`, color: highlight ? '#d4fbff' : '#bef0ff', fontStyle: 'bold',
      }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', highlight ? 7 : 0).setDepth(9);

      const hit = this.add.rectangle(cx, by, btnW, btnH).setDepth(10).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { drawBg(true); txt.setColor('#ffffff'); });
      hit.on('pointerout',  () => { drawBg(false); txt.setColor(highlight ? '#d4fbff' : '#bef0ff'); });
      hit.on('pointerdown', () => {
        this.tweens.add({ targets: bg, alpha: 0.6, yoyo: true, duration: 80 });
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('CreateJoinScene', { mode }));
      });
    });
  }

  // ── BOTTOM BAR ────────────────────────────────────────────────────────────────

  private createBottomBar(w: number, h: number) {
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(1, 0x5ee8ff, 0.15);
    g.lineBetween(w * 0.05, h - 42, w * 0.95, h - 42);
    this.add.text(w * 0.06, h - 24, 'ÚNETE A LA COMUNIDAD', {
      fontSize: '11px', color: '#4ac6d8',
    }).setOrigin(0, 0.5).setDepth(11);
    this.add.text(w - 14, h - 24, 'v0.1.0', {
      fontSize: '11px', color: '#3a9baf',
    }).setOrigin(1, 0.5).setDepth(11);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────────

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
