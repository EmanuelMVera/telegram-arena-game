import Phaser from 'phaser';
import {
  getClientIdentity,
  getPlayerDisplayName,
  savePlayerAlias,
} from '../telegram/telegram';
import { socket } from '../network/socket';
import { getLayout, applyBgCover, clamp } from '../utils/layout';
import { buildAvatar } from '../utils/avatar';

export class MainMenuScene extends Phaser.Scene {
  private aliasText!: Phaser.GameObjects.Text;

  // Join modal
  private joinModalObjects: Phaser.GameObjects.GameObject[] = [];
  private joinInput: HTMLInputElement | null = null;
  private joinErrorText: Phaser.GameObjects.Text | null = null;

  // Debounce handle for resize rebuilds
  private _rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() { super('MainMenuScene'); }

  create() {
    this.buildLayout();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      if (this._rebuildTimer !== null) { clearTimeout(this._rebuildTimer); this._rebuildTimer = null; }
      this.scale.off('resize', this.onResize, this);
      this.closeJoinModal();   // removes keyboard handler + input + phaser objects
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('roomError');
    });
  }

  private onResize(_size: Phaser.Structs.Size) {
    // Debounce: wait until resize events stop firing (device rotation fires many).
    if (this._rebuildTimer !== null) clearTimeout(this._rebuildTimer);
    this._rebuildTimer = window.setTimeout(() => {
      this._rebuildTimer = null;
      if (!this.scene.isActive()) return;
      this.tweens.killAll();
      this.children.removeAll(true);
      this.aliasText = undefined as unknown as Phaser.GameObjects.Text;
      this.closeJoinModal();
      this.buildLayout();
    }, 150);
  }

  // ── FULL LAYOUT BUILD ─────────────────────────────────────────────────────────

  private buildLayout() {
    const { width: w, height: h } = this.scale;
    const layout = getLayout(w, h);

    this.createBackground(w, h, layout);
    this.createVignette(w, h);
    this.drawFrameCorners(w, h);

    if (layout.isPortrait) {
      this.buildPortraitLayout(w, h, layout);
    } else {
      this.buildLandscapeLayout(w, h, layout);
    }

    this.createBottomBar(w, h, layout);
  }

  // ── BACKGROUND ───────────────────────────────────────────────────────────────

  private createBackground(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    this.cameras.main.setBackgroundColor('#030810');

    const bg = this.add.image(w / 2, h / 2, layout.bgKey).setDepth(-20);
    applyBgCover(bg, w, h);

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.28).setDepth(-9);

    // Ambient particles
    const colors = [0x57eaff, 0x8ef8ff, 0x2dd7e6, 0xb0f4ff, 0x44aaff];
    for (let i = 0; i < 28; i++) {
      const r = Phaser.Math.FloatBetween(0.8, 3.0);
      const a = Phaser.Math.FloatBetween(0.12, 0.55);
      const color = Phaser.Math.RND.pick(colors);
      const p = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(Math.floor(h * 0.35), h),
        r, color, a,
      ).setDepth(-3).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(55, 150),
        x: p.x + Phaser.Math.Between(-24, 24),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 7000),
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        onRepeat: () => {
          p.setPosition(Phaser.Math.Between(0, w), Phaser.Math.Between(Math.floor(h * 0.35), h));
          p.setAlpha(a);
        },
      });
    }

    const scan = this.add.rectangle(w / 2, h * 0.1, w, 1, 0x5ee8ff, 0.018)
      .setDepth(-5).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: scan, y: h + 10, duration: 9000, repeat: -1, ease: 'Linear' });

    this.tweens.add({ targets: bg, scale: bg.scale * 1.025, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private createVignette(w: number, h: number) {
    const g = this.add.graphics().setDepth(-6);
    for (let i = 10; i >= 1; i--) {
      const t = i / 10;
      const a = 0.11 * t * t;
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
    const m = 14, s = 20;
    ([[m, m], [w - m, m], [m, h - m], [w - m, h - m]] as [number, number][]).forEach(([x, y]) => {
      const sx = x === m ? 1 : -1, sy = y === m ? 1 : -1;
      g.lineBetween(x, y, x + sx * s, y);
      g.lineBetween(x, y, x, y + sy * s);
      g.fillStyle(0x5ee8ff, 0.55);
      g.fillRect(x - 1, y - 1, 2, 2);
    });
  }

  // ── PORTRAIT LAYOUT ───────────────────────────────────────────────────────────
  // Stacked vertically: logo → avatar → name → buttons

  private buildPortraitLayout(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    const cx = layout.cx;

    // Logo — sits in top 10% of screen
    const logoY = h * 0.12;
    this.createLogoSection(cx, logoY, w, h, layout);

    // Avatar — size proportional to screen, but more conservative on short screens
    const avatarR = clamp(Math.round(Math.min(w * 0.105, h * 0.075, 62)), 32, 62);
    // Pin avatar below the logo separator with a fixed gap
    const logoSepY = logoY + layout.shortSide * 0.085;
    const avatarCy = Math.max(logoSepY + avatarR + layout.pad * 1.8, h * 0.33);
    this.createAvatarCard(cx, avatarCy, avatarR, w, h, layout);

    // Name / alias — always below avatar with proportional gap
    const nameGap = Math.max(layout.pad * 1.8, 14);
    const nameY   = avatarCy + avatarR + nameGap;
    this.createNameSection(cx, nameY, avatarR, layout);

    // Buttons — below name section (name + edit button)
    const nameSectionH = layout.fs(22) + layout.pad * 3.5 + Math.max(26, Math.round(layout.fs(14) * 2));
    const btnTopY = Math.max(nameY + nameSectionH, h * 0.68);
    this.createButtons(cx, btnTopY, Math.min(w * 0.86, 420), layout);
  }

  // ── LANDSCAPE LAYOUT ──────────────────────────────────────────────────────────
  // Two columns: left = logo + buttons, right = avatar + name

  private buildLandscapeLayout(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    const leftCx = w * 0.27;
    const rightCx = w * 0.73;

    // Logo on the left side
    this.createLogoSection(leftCx, h * 0.12, w, h, layout);

    // Avatar on the right
    const avatarR = clamp(Math.round(Math.min(w * 0.080, h * 0.115)), 38, 72);
    const avatarCy = h * 0.41;
    this.createAvatarCard(rightCx, avatarCy, avatarR, w, h, layout);

    // Name on the right, below avatar
    const nameY = avatarCy + avatarR + layout.pad * 2 + 16;
    this.createNameSection(rightCx, nameY, avatarR, layout);

    // Buttons on the left
    const btnTopY = h * 0.34;
    this.createButtons(leftCx, btnTopY, Math.min(w * 0.48, 420), layout);
  }

  // ── LOGO ──────────────────────────────────────────────────────────────────────

  private createLogoSection(cx: number, cy: number, w: number, h: number, layout: ReturnType<typeof getLayout>) {
    // Diamond + decorative lines above logo text
    const ornY = cy - layout.vmin * 0.045;
    this.drawDiamond(cx, ornY, 8, 0x5ee8ff, 0.90).setDepth(3);
    const lineG = this.add.graphics().setDepth(3);
    lineG.lineStyle(1, 0x5ee8ff, 0.40);
    lineG.lineBetween(cx - 70, ornY, cx - 18, ornY);
    lineG.lineBetween(cx + 18, ornY, cx + 70, ornY);

    if (this.textures.exists('logo')) {
      const logo = this.add.image(cx, cy, 'logo').setDepth(3);
      const maxLogoW = Math.min(w * (layout.isPortrait ? 0.84 : 0.46), layout.isPortrait ? 520 : 380);
      const maxLogoH = layout.isPortrait ? h * 0.18 : h * 0.2;
      logo.setScale(Math.min(maxLogoW / logo.width, maxLogoH / logo.height));
    } else {
      // Fallback text title
      const fs = Math.round(layout.fs(28));
      this.add.text(cx, cy, 'ARENA\nBRAWLER 2D', {
        align: 'center', fontSize: `${fs}px`, color: '#c2f8ff', fontStyle: 'bold',
        lineSpacing: Math.round(fs * 0.18),
      }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 22).setDepth(3);
    }

    // Separator below logo
    const sepW = Math.min(w * 0.48, 260);
    const sepY = cy + layout.vmin * 0.085;
    const g2 = this.add.graphics().setDepth(2);
    g2.lineStyle(1, 0x5ee8ff, 0.35);
    g2.lineBetween(cx - sepW / 2, sepY, cx - 8, sepY);
    g2.lineBetween(cx + 8, sepY, cx + sepW / 2, sepY);
    this.drawDiamond(cx, sepY, 4, 0x5ee8ff, 0.75).setDepth(2);
  }

  // ── AVATAR CARD ───────────────────────────────────────────────────────────────

  private createAvatarCard(
    cx: number,
    cy: number,
    avatarR: number,
    _w: number,
    _h: number,
    _layout: ReturnType<typeof getLayout>,
  ) {
    const identity = getClientIdentity();

    // Glow layers (ADD blend)
    const glowG = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    ([{ r: avatarR + 34, a: 0.06 }, { r: avatarR + 20, a: 0.10 }, { r: avatarR + 12, a: 0.15 }])
      .forEach(({ r, a }) => { glowG.fillStyle(0x3399ff, a); glowG.fillCircle(cx, cy, r); });

    // Dark bg so mask is clean
    this.add.circle(cx, cy, avatarR + 2, 0x020d1a, 1).setDepth(5);

    // Avatar (Telegram photo or initials)
    const { setDepth } = buildAvatar(this, cx, cy, avatarR, identity, 6);
    setDepth(6);

    // Ornamental ring
    const ringSize = avatarR * 3.2;
    const ringImg = this.add.image(cx, cy, 'avatar-ring')
      .setDisplaySize(ringSize, ringSize).setDepth(7);
    this.tweens.add({
      targets: ringImg,
      alpha: { from: 0.82, to: 1.0 },
      scaleX: ringImg.scaleX * 1.02,
      scaleY: ringImg.scaleY * 1.02,
      duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Orbiting dots
    const orbitR = avatarR + 20;
    const numDots = 7;
    const orbitState = { angle: 0 };
    const orbitDots = Array.from({ length: numDots }, (_, i) => {
      const a = (i / numDots) * Math.PI * 2;
      const big = i % 3 === 0;
      return this.add.arc(
        cx + Math.cos(a) * orbitR, cy + Math.sin(a) * orbitR,
        big ? 3.0 : 1.8, 0, 360, false,
        big ? 0x8ef8ff : 0x5ee8ff, big ? 0.9 : 0.55,
      ).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    });
    this.tweens.add({
      targets: orbitState, angle: Math.PI * 2, duration: 5800, repeat: -1, ease: 'Linear',
      onUpdate: () => {
        orbitDots.forEach((dot, i) => {
          const a = orbitState.angle + (i / numDots) * Math.PI * 2;
          dot.setPosition(cx + Math.cos(a) * orbitR, cy + Math.sin(a) * orbitR);
          dot.setAlpha(0.25 + 0.75 * ((1 + Math.sin(a * 2 + i)) / 2));
        });
      },
    });
  }

  // ── NAME / ALIAS ──────────────────────────────────────────────────────────────

  private createNameSection(
    cx: number,
    nameY: number,
    _avatarR: number,
    layout: ReturnType<typeof getLayout>,
  ) {
    const nameFs = Math.round(layout.fs(22));
    this.aliasText = this.add.text(cx, nameY, getPlayerDisplayName(), {
      fontSize: `${nameFs}px`, color: '#e8feff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 10).setDepth(6);

    // Separator
    const sepW = Math.min(layout.vmin * 0.30, 130);
    const sepY = nameY + nameFs + layout.pad * 0.8;
    const sepG = this.add.graphics().setDepth(5);
    sepG.lineStyle(1, 0x5ee8ff, 0.20);
    sepG.lineBetween(cx - sepW / 2, sepY, cx + sepW / 2, sepY);
    this.drawDiamond(cx, sepY, 3, 0x5ee8ff, 0.55).setDepth(5);

    // Single alias edit button — centred below name
    const abBtnY = sepY + layout.pad * 1.8;
    const aBtnW = Math.min(layout.vmin * 0.38, 148);
    const aBtnH = Math.max(26, Math.round(layout.fs(14) * 2));
    const aBtnFs = Math.round(layout.fs(12));

    const abG = this.add.graphics().setDepth(6);
    const drawABtn = (hover: boolean) => {
      abG.clear();
      abG.fillStyle(hover ? 0x143d54 : 0x081824, hover ? 0.97 : 0.88);
      abG.fillRoundedRect(cx - aBtnW / 2, abBtnY - aBtnH / 2, aBtnW, aBtnH, 7);
      abG.lineStyle(1, 0x5ee8ff, hover ? 0.80 : 0.38);
      abG.strokeRoundedRect(cx - aBtnW / 2, abBtnY - aBtnH / 2, aBtnW, aBtnH, 7);
    };
    drawABtn(false);
    const abTxt = this.add.text(cx, abBtnY, '✎  Editar alias', {
      fontSize: `${aBtnFs}px`, color: '#8eefff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(7);
    const abHit = this.add
      .rectangle(cx, abBtnY, aBtnW, aBtnH)
      .setDepth(8)
      .setInteractive({ useHandCursor: true });
    abHit.on('pointerover', () => { drawABtn(true); abTxt.setColor('#d4fbff'); });
    abHit.on('pointerout',  () => { drawABtn(false); abTxt.setColor('#8eefff'); });
    abHit.on('pointerdown', () => {
      const next = window.prompt('Alias de juego', getPlayerDisplayName());
      if (next === null) return;
      savePlayerAlias(next);
      this.aliasText.setText(getPlayerDisplayName());
    });
  }

  // ── MAIN BUTTONS ──────────────────────────────────────────────────────────────

  private createButtons(
    cx: number,
    topY: number,
    maxBtnW: number,
    layout: ReturnType<typeof getLayout>,
  ) {
    const defs: { label: string; action: () => void }[] = [
      {
        label: 'CREAR PARTIDA',
        action: () => this.handleCreate(),
      },
      {
        label: 'UNIRSE A PARTIDA',
        action: () => this.openJoinModal(),
      },
    ];

    const spacing = Math.max(74, Math.round(layout.actionBounds.height * 0.32));

    defs.forEach(({ label, action }, idx) => {
      const by = topY + idx * spacing;

      const dW = Math.min(maxBtnW, layout.contentBounds.width * 0.9);
      const dH = Math.max(54, Math.round(layout.fs(17) * 2.4));
      const btn = this.add.rectangle(cx, by, dW, dH, 0x0a1929, 0.9)
        .setStrokeStyle(2, 0x63d9ea, 0.75)
        .setDepth(8)
        .setInteractive({ useHandCursor: true });

      // Drop shadow
      this.add.rectangle(cx + 3, by + 4, dW, dH, 0x000000, 0.25).setDepth(6);

      // Idle glow
      const idleGlow = this.add.rectangle(cx, by, dW + 10, dH + 8, 0x52bfd4, 0.08).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: idleGlow,
        alpha: { from: 0.08, to: 0.26 },
        duration: 1800 + idx * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      // Hover / press glow refs
      const atmoGlow = this.add.rectangle(cx, by, dW + 24, dH + 20, 0x68cde0, 0.1).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const rimGlow = this.add.rectangle(cx, by, dW + 6, dH + 6).setStrokeStyle(2, 0xa9f0ff, 0.75).setDepth(9).setAlpha(0);

      // Fallback label (shown if image asset has no text baked in)
      const lblFs = Math.round(layout.fs(13));
      const lbl = this.add.text(cx, by, label, {
        fontSize: `${lblFs}px`, color: '#ddf5ff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(10).setAlpha(1);
      // Only show label if the button image appears blank (can't detect easily, keep at 0)

      btn.on('pointerover', () => {
        this.tweens.killTweensOf([btn, atmoGlow, rimGlow]);
        this.tweens.add({ targets: [btn, lbl], scaleX: 1.02, scaleY: 1.02, duration: 120, ease: 'Back.easeOut' });
        this.tweens.add({ targets: [atmoGlow, rimGlow], alpha: 1, duration: 140 });
        btn.setFillStyle(0x12263a, 0.94);
      });

      btn.on('pointerout', () => {
        this.tweens.killTweensOf([btn, atmoGlow, rimGlow]);
        this.tweens.add({ targets: [btn, lbl], scaleX: 1, scaleY: 1, duration: 160, ease: 'Power2' });
        this.tweens.add({ targets: [atmoGlow, rimGlow], alpha: 0, duration: 200 });
        btn.setFillStyle(0x0a1929, 0.9);
      });

      btn.on('pointerdown', () => {
        this.tweens.killTweensOf([btn, lbl]);
        this.tweens.add({ targets: [btn, lbl], scaleX: 0.98, scaleY: 0.98, duration: 65, yoyo: true });
        this.tweens.add({ targets: rimGlow, alpha: 2.0, duration: 60, yoyo: true });
        this.time.delayedCall(90, action);
      });
    });
  }

  // ── CREATE ROOM ───────────────────────────────────────────────────────────────

  private handleCreate() {
    const identity = getClientIdentity();

    // Remove any stale listeners before registering
    socket.off('roomCreated');
    socket.off('roomError');

    socket.once('roomCreated', (data: { roomId: string; participants: Record<string, unknown>; isHost: boolean }) => {
      socket.off('roomError');
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LobbyScene', { roomId: data.roomId, isHost: true, participants: data.participants });
      });
    });

    socket.once('roomError', (err: { message: string }) => {
      socket.off('roomCreated');
      this.showFloatingError(err.message);
    });

    socket.emit('createRoom', identity);
  }

  private showFloatingError(msg: string) {
    const { width: w, height: h } = this.scale;
    const errTxt = this.add.text(w / 2, h * 0.15, msg, {
      fontSize: `${Math.round(getLayout(w, h).fs(14))}px`,
      color: '#ff6666', fontStyle: 'bold',
      backgroundColor: '#1a0000',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: errTxt, alpha: 0, duration: 300,
      delay: 2800,
      onComplete: () => errTxt.destroy(),
    });
  }

  // ── JOIN MODAL ────────────────────────────────────────────────────────────────

  private openJoinModal() {
    if (this.joinModalObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    const layout = getLayout(w, h);
    const cx = layout.cx;
    const panelW = Math.min(w * 0.88, 420);
    const panelH = Math.min(h * 0.52, 360);
    const panelTop = layout.cy - panelH / 2;

    // Overlay
    const overlay = this.add.rectangle(cx, layout.cy, w, h, 0x000000, 0.82)
      .setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeJoinModal());

    // Panel
    const panelG = this.add.graphics().setDepth(26);
    panelG.fillStyle(0x030e1a, 0.97);
    panelG.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 10);
    panelG.lineStyle(1.5, 0x5ee8ff, 0.80);
    panelG.strokeRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 10);

    // Title
    const titleFs = Math.round(layout.fs(14));
    const header = this.add.text(cx, panelTop + 28, 'INGRESÁ EL CÓDIGO DE SALA', {
      fontSize: `${titleFs}px`, color: '#5ee8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(27);

    // HTML input element (simplest cross-platform text entry)
    const inputY = panelTop + panelH * 0.44;
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.maxLength = 6;
    inputEl.placeholder = 'CÓDIGO';
    inputEl.style.cssText = `
      position:absolute; z-index:9999;
      width:200px; height:44px;
      font-size:24px; text-align:center; letter-spacing:8px;
      text-transform:uppercase; font-family:monospace;
      background:rgba(0,0,0,0.75); color:#ffffff;
      border:1.5px solid #5ee8ff; border-radius:6px;
      outline:none; pointer-events:auto;
    `;
    // Position over the canvas
    this.positionInputEl(inputEl, cx, inputY, w, h);
    document.body.appendChild(inputEl);
    this.joinInput = inputEl;
    setTimeout(() => inputEl.focus(), 50);

    // Error text placeholder
    const errTxt = this.add.text(cx, inputY + 36, '', {
      fontSize: `${Math.round(layout.fs(12))}px`, color: '#ff6666',
    }).setOrigin(0.5).setDepth(27);
    this.joinErrorText = errTxt;

    // Confirm button
    const confirmY = panelTop + panelH * 0.72;
    const cbW = Math.min(panelW * 0.55, 200), cbH = Math.max(36, Math.round(layout.fs(15) * 2.2));
    const confirmG = this.add.graphics().setDepth(27);
    const drawConfirm = (hover: boolean) => {
      confirmG.clear();
      confirmG.fillStyle(hover ? 0x145f78 : 0x0d4d62, 0.97);
      confirmG.fillRoundedRect(cx - cbW / 2, confirmY - cbH / 2, cbW, cbH, 8);
      confirmG.lineStyle(1.5, 0x5ee8ff, 0.80);
      confirmG.strokeRoundedRect(cx - cbW / 2, confirmY - cbH / 2, cbW, cbH, 8);
    };
    drawConfirm(false);
    const confirmTxt = this.add.text(cx, confirmY, 'UNIRSE', {
      fontSize: `${Math.round(layout.fs(13))}px`, color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(28);
    const confirmHit = this.add
      .rectangle(cx, confirmY, cbW, cbH)
      .setDepth(29).setInteractive({ useHandCursor: true });
    confirmHit.on('pointerover', () => drawConfirm(true));
    confirmHit.on('pointerout',  () => drawConfirm(false));
    confirmHit.on('pointerdown', () => this.submitJoinCode(inputEl.value));

    // Close button
    const closeY = panelTop + panelH - 30;
    const closeTxt = this.add.text(cx, closeY, 'CANCELAR', {
      fontSize: `${Math.round(layout.fs(11))}px`, color: '#4a8fa8',
    }).setOrigin(0.5).setDepth(27).setInteractive({ useHandCursor: true });
    closeTxt.on('pointerdown', () => this.closeJoinModal());

    // ENTER key
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.submitJoinCode(inputEl.value);
      if (e.key === 'Escape') this.closeJoinModal();
    };
    window.addEventListener('keydown', onKey);

    this.joinModalObjects.push(overlay, panelG, header, errTxt, confirmG, confirmTxt, confirmHit, closeTxt);
    // Store onKey cleanup in scene data
    this.data.set('_joinKeyHandler', onKey);
  }

  private positionInputEl(el: HTMLInputElement, cx: number, cy: number, w: number, h: number) {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    // Map Phaser coordinates to screen coordinates
    const scaleX = rect.width / w;
    const scaleY = rect.height / h;
    const elW = 200;
    const elH = 44;
    el.style.left = `${rect.left + cx * scaleX - elW / 2}px`;
    el.style.top  = `${rect.top  + cy * scaleY - elH / 2}px`;
    el.style.width  = `${elW}px`;
    el.style.height = `${elH}px`;
  }

  private submitJoinCode(raw: string) {
    const code = raw.trim().toUpperCase();
    if (code.length !== 6) {
      if (this.joinErrorText) this.joinErrorText.setText('El código debe tener 6 caracteres');
      return;
    }
    if (this.joinErrorText) this.joinErrorText.setText('Conectando...');

    const identity = getClientIdentity();
    socket.off('roomJoined');
    socket.off('roomError');

    socket.once('roomJoined', (data: { roomId: string; participants: Record<string, unknown>; isHost: boolean }) => {
      socket.off('roomError');
      this.closeJoinModal();
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LobbyScene', { roomId: data.roomId, isHost: false, participants: data.participants });
      });
    });

    socket.once('roomError', (err: { message: string }) => {
      socket.off('roomJoined');
      if (this.joinErrorText) this.joinErrorText.setText(err.message);
    });

    socket.emit('joinRoom', { roomId: code, identity });
  }

  private closeJoinModal() {
    const handler = this.data.get('_joinKeyHandler') as ((e: KeyboardEvent) => void) | undefined;
    if (handler) window.removeEventListener('keydown', handler);
    this.data.remove('_joinKeyHandler');
    this.cleanupJoinModal();
  }

  private cleanupJoinModal() {
    this.joinModalObjects.forEach(o =>
      (o as Phaser.GameObjects.GameObject & { destroy(): void }).destroy()
    );
    this.joinModalObjects = [];
    this.joinErrorText = null;
    if (this.joinInput) {
      this.joinInput.remove();
      this.joinInput = null;
    }
  }

  // ── BOTTOM BAR ────────────────────────────────────────────────────────────────

  private createBottomBar(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(1, 0x5ee8ff, 0.14);
    g.lineBetween(w * 0.05, h - 38, w * 0.95, h - 38);
    const barFs = Math.round(layout.fs(10));
    this.add.text(w * 0.06, h - 20, 'ARENA BRAWLER 2D', {
      fontSize: `${barFs}px`, color: '#4ac6d8',
    }).setOrigin(0, 0.5).setDepth(11);
    this.add.text(w - 14, h - 20, 'v0.1.0', {
      fontSize: `${barFs}px`, color: '#3a9baf',
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
