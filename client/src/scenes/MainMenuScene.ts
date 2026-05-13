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
    this.cameras.main.setBackgroundColor('#030810');

    // Choose bg based on aspect ratio — both loaded in LoadingScene
    const bgKey = w >= h ? 'bg-desktop' : 'bg-mobile';
    const bg = this.add.image(w / 2, h / 2, bgKey).setDepth(-20);
    const bgScale = Math.max(w / bg.width, h / bg.height);
    bg.setScale(bgScale);

    // Light dark tint so UI elements stay readable
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.30).setDepth(-9);

    this.drawFrameCorners(w, h);

    // Ambient floating particles — match the bioluminescent style of the bg
    const colors = [0x57eaff, 0x8ef8ff, 0x2dd7e6, 0xb0f4ff, 0x44aaff];
    for (let i = 0; i < 36; i++) {
      const r = Phaser.Math.FloatBetween(0.8, 3.2);
      const a = Phaser.Math.FloatBetween(0.12, 0.60);
      const color = Phaser.Math.RND.pick(colors);
      const p = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(Math.floor(h * 0.4), h),
        r, color, a,
      ).setDepth(-3).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(60, 160),
        x: p.x + Phaser.Math.Between(-28, 28),
        alpha: 0,
        duration: Phaser.Math.Between(3200, 7000),
        delay: Phaser.Math.Between(0, 4500),
        repeat: -1,
        onRepeat: () => {
          p.setPosition(Phaser.Math.Between(0, w), Phaser.Math.Between(Math.floor(h * 0.4), h));
          p.setAlpha(a);
        },
      });
    }

    // Subtle scan-line that drifts downward
    const scan = this.add.rectangle(w / 2, h * 0.12, w, 1, 0x5ee8ff, 0.022)
      .setDepth(-5).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: scan, y: h + 10, duration: 9000, repeat: -1, ease: 'Linear', delay: 500 });

    // Slow bg parallax
    this.tweens.add({ targets: bg, scale: bgScale * 1.025, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private createVignette(w: number, h: number) {
    const g = this.add.graphics().setDepth(-6);
    for (let i = 10; i >= 1; i--) {
      const t = i / 10;
      const a = 0.12 * t * t;
      g.fillStyle(0x000000, a);
      g.fillRect(0, 0, w * 0.28 * t, h);
      g.fillRect(w - w * 0.28 * t, 0, w * 0.28 * t, h);
      g.fillRect(0, 0, w, h * 0.22 * t);
      g.fillRect(0, h - h * 0.22 * t, w, h * 0.22 * t);
    }
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(-4);
    g.lineStyle(1, 0x5ee8ff, 0.32);
    const m = 14, s = 22;
    ([[m, m], [w - m, m], [m, h - m], [w - m, h - m]] as [number, number][]).forEach(([x, y]) => {
      const sx = x === m ? 1 : -1, sy = y === m ? 1 : -1;
      g.lineBetween(x, y, x + sx * s, y);
      g.lineBetween(x, y, x, y + sy * s);
      g.fillStyle(0x5ee8ff, 0.6);
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
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 22).setDepth(3);

    const g2 = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.52, 300);
    g2.lineStyle(1, 0x5ee8ff, 0.38);
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

    // ── Rounded glass panel ───────────────────────────────────────────────────
    const panelG = this.add.graphics().setDepth(4);
    panelG.fillStyle(0x020c18, 0.82);
    panelG.fillRoundedRect(cx - panelW / 2, panelCy - panelH / 2, panelW, panelH, 10);
    panelG.lineStyle(1, 0x5ee8ff, 0.40);
    panelG.strokeRoundedRect(cx - panelW / 2, panelCy - panelH / 2, panelW, panelH, 10);
    panelG.lineStyle(1, 0xaaf5ff, 0.09);
    panelG.lineBetween(cx - panelW / 2 + 18, panelCy - panelH / 2 + 2, cx + panelW / 2 - 18, panelCy - panelH / 2 + 2);

    // ── Multi-layer avatar glow ───────────────────────────────────────────────
    const glowG = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    ([{ r: avatarR + 36, a: 0.06 }, { r: avatarR + 22, a: 0.10 }, { r: avatarR + 13, a: 0.15 }]).forEach(({ r, a }) => {
      glowG.fillStyle(0x3399ff, a);
      glowG.fillCircle(cx, avatarCy, r);
    });

    // Dark bg behind avatar (keeps mask clean)
    this.add.circle(cx, avatarCy, avatarR + 2, 0x020d1a, 1).setDepth(5);

    // ── Avatar mask ───────────────────────────────────────────────────────────
    const maskG = this.add.graphics().setAlpha(0).setDepth(0);
    maskG.fillStyle(0xffffff);
    maskG.fillCircle(cx, avatarCy, avatarR);
    const mask = maskG.createGeometryMask();

    // ── Avatar image (3.2× so artwork fills the circle completely) ────────────
    const savedIdx = getSavedAvatarIndex();
    this.avatarImage = this.add.image(cx, avatarCy, 'avatars', String(savedIdx))
      .setDisplaySize(avatarR * 3.2, avatarR * 3.2).setMask(mask).setDepth(6);

    // ── Avatar ring image (ornamental ring, center transparent) ───────────────
    // Sized so its inner opening sits just outside the avatar circle
    const ringSize = avatarR * 3.2;
    const ringImg = this.add.image(cx, avatarCy, 'avatar-ring')
      .setDisplaySize(ringSize, ringSize).setDepth(7);
    // Breathing pulse on the ring
    this.tweens.add({
      targets: ringImg,
      alpha: { from: 0.82, to: 1.0 },
      scaleX: ringImg.scaleX * 1.02,
      scaleY: ringImg.scaleY * 1.02,
      duration: 2800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Orbiting dots (appear in front of the ring) ───────────────────────────
    const orbitR = avatarR + 20;
    const numDots = 7;
    const orbitState = { angle: 0 };
    const orbitDots = Array.from({ length: numDots }, (_, i) => {
      const a = (i / numDots) * Math.PI * 2;
      const big = i % 3 === 0;
      return this.add.arc(
        cx + Math.cos(a) * orbitR, avatarCy + Math.sin(a) * orbitR,
        big ? 3.0 : 1.8, 0, 360, false,
        big ? 0x8ef8ff : 0x5ee8ff, big ? 0.9 : 0.55,
      ).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    });
    this.tweens.add({
      targets: orbitState, angle: Math.PI * 2, duration: 5800, repeat: -1, ease: 'Linear',
      onUpdate: () => {
        orbitDots.forEach((dot, i) => {
          const a = orbitState.angle + (i / numDots) * Math.PI * 2;
          dot.setPosition(cx + Math.cos(a) * orbitR, avatarCy + Math.sin(a) * orbitR);
          dot.setAlpha(0.25 + 0.75 * ((1 + Math.sin(a * 2 + i)) / 2));
        });
      },
    });

    // ── Telegram photo (loads over local avatar if available) ─────────────────
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

    // ── Player name ───────────────────────────────────────────────────────────
    const nameFs = Math.max(22, Math.round(Math.min(w * 0.062, 38)));
    this.aliasText = this.add.text(cx, h * 0.510, getPlayerDisplayName(), {
      fontSize: `${nameFs}px`, color: '#e8feff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 12).setDepth(6);

    // Separator
    const sepW2 = Math.min(w * 0.32, 140);
    const sepY = h * 0.549;
    const sepG = this.add.graphics().setDepth(5);
    sepG.lineStyle(1, 0x5ee8ff, 0.20);
    sepG.lineBetween(cx - sepW2 / 2, sepY, cx + sepW2 / 2, sepY);
    this.drawDiamond(cx, sepY, 3, 0x5ee8ff, 0.55).setDepth(5);

    // ── Action buttons (Alias / Avatar) ───────────────────────────────────────
    const btnY = h * 0.577;
    const halfGap = Math.min(panelW * 0.22, 100);
    const aBtnW = Math.min(panelW * 0.38, 148);
    const aBtnH = 32;

    [
      {
        x: cx - halfGap, label: '✎  Alias',
        action: () => {
          const next = window.prompt('Alias de juego', getPlayerDisplayName());
          if (next === null) return;
          savePlayerAlias(next);
          this.aliasText.setText(getPlayerDisplayName());
        },
      },
      { x: cx + halfGap, label: '◈  Avatar', action: () => this.openAvatarPicker(avatarR) },
    ].forEach(({ x, label, action }) => {
      const abG = this.add.graphics().setDepth(6);
      const drawABtn = (hover: boolean) => {
        abG.clear();
        abG.fillStyle(hover ? 0x143d54 : 0x081824, hover ? 0.97 : 0.88);
        abG.fillRoundedRect(x - aBtnW / 2, btnY - aBtnH / 2, aBtnW, aBtnH, 7);
        abG.lineStyle(1, 0x5ee8ff, hover ? 0.80 : 0.38);
        abG.strokeRoundedRect(x - aBtnW / 2, btnY - aBtnH / 2, aBtnW, aBtnH, 7);
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

    const overlay = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.84)
      .setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeAvatarPicker());

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

    const cellSize = Math.min((panelW - 44) / 3, (panelH - 120) / 3);
    const thumbR = Math.floor(cellSize * 0.44);
    const gridStartX = cx - cellSize;
    const gridStartY = h / 2 - panelH / 2 + 82 + cellSize / 2;

    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const tx = gridStartX + col * cellSize;
      const ty = gridStartY + row * cellSize;

      const borderG = this.add.graphics().setDepth(27);
      const drawBorder = (selected: boolean, hover: boolean) => {
        borderG.clear();
        if (selected)   { borderG.fillStyle(0x5ee8ff, 1.0); borderG.fillCircle(tx, ty, thumbR + 4); }
        else if (hover) { borderG.fillStyle(0x3a7a9a, 0.75); borderG.fillCircle(tx, ty, thumbR + 4); }
        else            { borderG.fillStyle(0x18384e, 0.65); borderG.fillCircle(tx, ty, thumbR + 4); }
      };
      drawBorder(i === currentIdx, false);

      const bgCirc = this.add.circle(tx, ty, thumbR + 1, 0x030e1a, 1).setDepth(27);

      const mG = this.add.graphics().setAlpha(0).setDepth(0);
      mG.fillStyle(0xffffff);
      mG.fillCircle(tx, ty, thumbR);
      const tMask = mG.createGeometryMask();

      const thumb = this.add.image(tx, ty, 'avatars', String(i))
        .setDisplaySize(thumbR * 3.2, thumbR * 3.2).setMask(tMask).setDepth(28)
        .setInteractive({ useHandCursor: true });

      // Mini ring on each picker thumbnail
      if (this.textures.exists('avatar-ring')) {
        const miniRing = this.add.image(tx, ty, 'avatar-ring')
          .setDisplaySize(thumbR * 3.2, thumbR * 3.2).setDepth(29).setAlpha(0.75);
        this.pickerObjects.push(miniRing);
      }

      thumb.on('pointerdown', () => {
        saveAvatarIndex(i);
        this.avatarImage.setTexture('avatars', String(i)).setDisplaySize(avatarR * 3.2, avatarR * 3.2);
        this.closeAvatarPicker();
      });
      thumb.on('pointerover', () => { if (i !== getSavedAvatarIndex()) drawBorder(false, true); });
      thumb.on('pointerout',  () => { if (i !== getSavedAvatarIndex()) drawBorder(false, false); });

      this.pickerObjects.push(borderG, bgCirc, mG, thumb);
    }

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

  // ── MAIN BUTTONS (image-based with glow fx) ───────────────────────────────────

  private createButtons(w: number, h: number) {
    const cx = w / 2;
    const maxBtnW = Math.min(w * 0.88, 520);
    const startY = h * 0.655;
    const spacing = Math.min(80, Math.round((h * 0.945 - startY) / 2.5));

    const defs: { key: string; mode: 'create' | 'join' }[] = [
      { key: 'btn-create', mode: 'create' },
      { key: 'btn-join',   mode: 'join'   },
    ];

    defs.forEach(({ key, mode }, idx) => {
      const by = startY + idx * spacing;

      // Button image — scale to fit maxBtnW, keep aspect ratio
      const btn = this.add.image(cx, by, key)
        .setDepth(8)
        .setInteractive({ useHandCursor: true });
      const scale = Math.min(maxBtnW / btn.width, 90 / btn.height);
      btn.setScale(scale);
      const dW = btn.displayWidth;
      const dH = btn.displayHeight;

      // ── Static drop-shadow ────────────────────────────────────────────────
      const shadow = this.add.graphics().setDepth(6).setAlpha(0.55);
      shadow.fillStyle(0x000000, 0.70);
      shadow.fillRoundedRect(cx - dW / 2 + 6, by - dH / 2 + 6, dW, dH, 5);

      // ── Atmospheric glow behind button (ADD blend) ────────────────────────
      const atmoGlow = this.add.graphics()
        .setDepth(7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      atmoGlow.fillStyle(0x1155cc, 0.55);
      atmoGlow.fillRoundedRect(cx - dW / 2 - 18, by - dH * 0.9, dW + 36, dH * 1.8, 14);

      // ── Rim light around button edges (ADD blend) ─────────────────────────
      const rimGlow = this.add.graphics()
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      rimGlow.lineStyle(4, 0x66aaff, 0.8);
      rimGlow.strokeRoundedRect(cx - dW / 2, by - dH / 2, dW, dH, 4);
      rimGlow.lineStyle(10, 0x3366cc, 0.25);
      rimGlow.strokeRoundedRect(cx - dW / 2 - 2, by - dH / 2 - 2, dW + 4, dH + 4, 6);

      // ── Shimmer strip (sweeps left→right on hover) ─────────────────────────
      const shimmer = this.add.rectangle(cx - dW / 2 - 10, by, 16, dH * 0.75, 0x99ddff, 0)
        .setDepth(10)
        .setBlendMode(Phaser.BlendModes.ADD);

      // ── Idle pulse (always on, very subtle) ───────────────────────────────
      const idleGlow = this.add.graphics()
        .setDepth(7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.18);
      idleGlow.fillStyle(0x0044aa, 0.45);
      idleGlow.fillRoundedRect(cx - dW / 2 - 6, by - dH / 2 - 3, dW + 12, dH + 6, 8);
      this.tweens.add({
        targets: idleGlow,
        alpha: { from: 0.10, to: 0.28 },
        duration: 1800 + idx * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      // ── Pointer events ────────────────────────────────────────────────────

      btn.on('pointerover', () => {
        this.tweens.killTweensOf([btn, atmoGlow, rimGlow, shimmer]);

        // Scale up
        this.tweens.add({ targets: btn, scaleX: scale * 1.03, scaleY: scale * 1.03, duration: 130, ease: 'Back.easeOut' });
        // Atmospheric glow fade in
        this.tweens.add({ targets: atmoGlow, alpha: 1, duration: 150 });
        // Rim fade in
        this.tweens.add({ targets: rimGlow, alpha: 1, duration: 150 });
        // Cyan tint
        btn.setTint(0xbbddff);

        // Shimmer sweep
        shimmer.setAlpha(0.65).setX(cx - dW / 2 - 10);
        this.tweens.add({ targets: shimmer, x: cx + dW / 2 + 14, alpha: 0, duration: 380, ease: 'Power2.easeIn' });
      });

      btn.on('pointerout', () => {
        this.tweens.killTweensOf([btn, atmoGlow, rimGlow]);
        this.tweens.add({ targets: btn, scaleX: scale, scaleY: scale, duration: 160, ease: 'Power2' });
        this.tweens.add({ targets: [atmoGlow, rimGlow], alpha: 0, duration: 220 });
        btn.clearTint();
      });

      btn.on('pointerdown', () => {
        // Slight press-down scale
        this.tweens.killTweensOf(btn);
        this.tweens.add({ targets: btn, scaleX: scale * 0.96, scaleY: scale * 0.96, duration: 65, yoyo: true, ease: 'Power2' });

        // White flash then back to tint
        btn.setTint(0xffffff);
        this.time.delayedCall(80, () => btn.setTint(0xbbddff));

        // Rim surge
        this.tweens.add({ targets: rimGlow, alpha: 2.0, duration: 60, yoyo: true });

        // Particle burst from edges
        this.emitButtonSpark(cx, by, dW, dH);

        // Transition
        this.time.delayedCall(80, () => {
          this.cameras.main.fadeOut(280, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('CreateJoinScene', { mode }));
        });
      });
    });
  }

  /** Burst of small cyan sparks from button edges on click */
  private emitButtonSpark(cx: number, cy: number, bw: number, bh: number) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const side = Phaser.Math.Between(0, 3);
      let px = cx, py = cy;
      if (side === 0) { px = cx + Phaser.Math.Between(-bw / 2, bw / 2); py = cy - bh / 2; }
      else if (side === 1) { px = cx + Phaser.Math.Between(-bw / 2, bw / 2); py = cy + bh / 2; }
      else if (side === 2) { px = cx - bw / 2; py = cy + Phaser.Math.Between(-bh / 2, bh / 2); }
      else { px = cx + bw / 2; py = cy + Phaser.Math.Between(-bh / 2, bh / 2); }

      const r = Phaser.Math.FloatBetween(2.5, 5.5);
      const color = Phaser.Math.RND.pick([0x88ccff, 0xaaddff, 0x5599ee, 0xffffff]);
      const spark = this.add.arc(px, py, r, 0, 360, false, color, 1)
        .setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.FloatBetween(50, 140);
      this.tweens.add({
        targets: spark,
        x: px + Math.cos(angle) * speed,
        y: py + Math.sin(angle) * speed - Phaser.Math.FloatBetween(0, 40),
        alpha: 0,
        scaleX: 0, scaleY: 0,
        duration: Phaser.Math.Between(320, 650),
        ease: 'Power2.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── BOTTOM BAR ────────────────────────────────────────────────────────────────

  private createBottomBar(w: number, h: number) {
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(1, 0x5ee8ff, 0.14);
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
}
