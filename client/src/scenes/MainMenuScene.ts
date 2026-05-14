import Phaser from 'phaser';
import { socket } from '../network/socket';
import {
  getClientIdentity,
  getPlayerDisplayName,
  getSavedAvatarIndex,
  saveAvatarIndex,
  savePlayerAlias,
} from '../telegram/telegram';

type ParticipantData = { name: string; ready: boolean; isHost: boolean };

export class MainMenuScene extends Phaser.Scene {
  private aliasText!: Phaser.GameObjects.Text;
  private avatarImage!: Phaser.GameObjects.Image;
  private avatarDisplaySize = 0;
  private pickerObjects: Phaser.GameObjects.GameObject[] = [];
  private joinModalObjects: Phaser.GameObjects.GameObject[] = [];
  private joinCodeText?: Phaser.GameObjects.Text;
  private joinErrorText?: Phaser.GameObjects.Text;
  private framesRegistered = false;

  constructor() { super('MainMenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.registerAvatarFrames();
    this.registerSocketEvents();
    this.createBackground(width, height);
    this.createAmbientFx(width, height);
    this.createLogo(width, height);
    this.createDecorativeElements(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
  }

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

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#020813');
    const bg = this.add.image(w / 2, h / 2, 'bg-desktop').setDepth(-20);
    bg.setScale(Math.max(w / bg.width, h / bg.height));
    // Dark vignette overlay for Hollow Knight atmosphere
    this.add.rectangle(w / 2, h / 2, w, h, 0x010a15, 0.50).setDepth(-10);
  }

  private createAmbientFx(w: number, h: number) {
    // Floating soul particles
    for (let i = 0; i < 26; i++) {
      const p = this.add.circle(
        Phaser.Math.Between(0, w),
        Phaser.Math.Between(h * 0.1, h),
        Phaser.Math.FloatBetween(1, 3.2),
        0x5bd4ed,
        Phaser.Math.FloatBetween(0.10, 0.28)
      ).setDepth(-5).setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(35, 120),
        x: p.x + Phaser.Math.Between(-22, 22),
        alpha: 0,
        duration: Phaser.Math.Between(3500, 7200),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        onRepeat: () =>
          p.setPosition(
            Phaser.Math.Between(0, w),
            Phaser.Math.Between(h * 0.25, h)
          ).setAlpha(Phaser.Math.FloatBetween(0.08, 0.28)),
      });
    }

    // Large ambient soul orb in background
    const orb = this.add.circle(w * 0.5, h * 0.52, Math.min(w, h) * 0.30, 0x03253d, 0.18)
      .setDepth(-8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: orb,
      alpha: { from: 0.12, to: 0.22 },
      scale: { from: 1, to: 1.05 },
      duration: 3400,
      yoyo: true,
      repeat: -1,
    });
  }

  private createLogo(w: number, h: number) {
    const logo = this.add.image(w * 0.5, h * 0.12, 'logo').setDepth(5);
    const maxW = Math.min(w * 0.30, 480);
    logo.setDisplaySize(maxW, (maxW / logo.width) * logo.height);
    this.tweens.add({ targets: logo, alpha: { from: 0.88, to: 1 }, duration: 2400, yoyo: true, repeat: -1 });
  }

  private createDecorativeElements(w: number, h: number) {
    const g = this.add.graphics().setDepth(3);
    const lineY = h * 0.236;
    const lineW = w * 0.54;
    const lx = (w - lineW) / 2;
    const rx = (w + lineW) / 2;

    // Main horizontal accent line
    g.lineStyle(1, 0x5ee8ff, 0.20);
    g.beginPath();
    g.moveTo(lx, lineY);
    g.lineTo(rx, lineY);
    g.strokePath();

    // Center diamond ornament
    g.lineStyle(1.5, 0x5ee8ff, 0.62);
    g.beginPath();
    g.moveTo(w / 2, lineY - 6);
    g.lineTo(w / 2 + 6, lineY);
    g.lineTo(w / 2, lineY + 6);
    g.lineTo(w / 2 - 6, lineY);
    g.closePath();
    g.strokePath();

    // Flanking dots
    const dots: [number, number][] = [[w / 2 - 18, 0.45], [w / 2 - 32, 0.20], [w / 2 + 18, 0.45], [w / 2 + 32, 0.20]];
    dots.forEach(([x, alpha]) => {
      g.fillStyle(0x5ee8ff, alpha);
      g.fillCircle(x, lineY, 2);
    });
  }

  private createPlayerCard(w: number, h: number) {
    // Card dimensions — wider so the name area has room
    const cardW = Math.min(w * 0.46, 730);
    const cardH = Math.min(h * 0.42, 320);
    const cardX = w * 0.27;
    const cardY = h * 0.60;

    // Avatar sizing
    const avatarR = Math.max(46, Math.min(76, Math.round(h * 0.080)));
    const maskR = avatarR;
    const ringSize = avatarR * 2.55;
    // Overscan: display avatar larger than mask so off-center artwork stays within the circle
    this.avatarDisplaySize = avatarR * 2.85;

    // ── Card background ──
    const card = this.add.graphics().setDepth(4);
    card.fillStyle(0x030e1c, 0.92);
    card.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 14);
    card.lineStyle(1.5, 0x5ee8ff, 0.34);
    card.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 14);

    // Subtle inner top glow stripe
    card.lineStyle(1, 0x5ee8ff, 0.09);
    card.beginPath();
    card.moveTo(cardX - cardW / 2 + 30, cardY - cardH / 2 + 1);
    card.lineTo(cardX + cardW / 2 - 30, cardY - cardH / 2 + 1);
    card.strokePath();

    // Corner brackets (Hollow Knight UI style)
    const cl = cardX - cardW / 2, cr = cardX + cardW / 2;
    const ct = cardY - cardH / 2, cb = cardY + cardH / 2;
    const cLen = 14;
    card.lineStyle(2, 0x5ee8ff, 0.65);
    [
      [cl, ct,  1,  1],
      [cr, ct, -1,  1],
      [cl, cb,  1, -1],
      [cr, cb, -1, -1],
    ].forEach(([x, y, sx, sy]) => {
      card.beginPath();
      card.moveTo(x, y + sy * cLen);
      card.lineTo(x, y);
      card.lineTo(x + sx * cLen, y);
      card.strokePath();
    });

    // ── Avatar ──
    const avatarX = cardX - cardW * 0.30;
    const avatarY = cardY;

    const avatarMaskG = this.add.graphics().setVisible(false).setDepth(5);
    avatarMaskG.fillStyle(0xffffff, 1).fillCircle(avatarX, avatarY, maskR);

    this.avatarImage = this.add.image(avatarX, avatarY, 'avatars', String(getSavedAvatarIndex()))
      .setDepth(6)
      .setDisplaySize(this.avatarDisplaySize, this.avatarDisplaySize)
      .setMask(avatarMaskG.createGeometryMask());

    const ring = this.add.image(avatarX, avatarY, 'avatar-ring')
      .setDepth(8)
      .setDisplaySize(ringSize, ringSize);
    this.tweens.add({ targets: ring, alpha: { from: 0.74, to: 1 }, duration: 2100, yoyo: true, repeat: -1 });

    // Small edit-avatar button (bottom-right of avatar circle)
    const editAvatarBtn = this.add.text(
      avatarX + maskR * 0.65,
      avatarY + maskR * 0.65,
      '✎',
      { fontSize: '14px', color: '#c8f5ff', backgroundColor: '#0a2535', padding: { x: 5, y: 2 } }
    ).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
    editAvatarBtn.on('pointerdown', () => this.openAvatarPicker(avatarR));

    // ── Vertical separator between avatar and text ──
    const textX = cardX - cardW * 0.03;
    const sepX = avatarX + maskR + Math.round((textX - avatarX - maskR) * 0.28);
    const sepG = this.add.graphics().setDepth(5);
    sepG.lineStyle(1, 0x1a5a6e, 0.50);
    sepG.beginPath();
    sepG.moveTo(sepX, cardY - cardH / 2 + 24);
    sepG.lineTo(sepX, cardY + cardH / 2 - 24);
    sepG.strokePath();

    // ── Text area ──
    const textAreaW = (cardX + cardW / 2 - 20) - textX;

    // "JUGADOR" label above name
    this.add.text(textX, cardY - 52, 'J U G A D O R', {
      fontSize: '10px', color: '#256a82', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(7);

    // Player name — truncated to prevent overflow
    const displayName = this.truncateName(getPlayerDisplayName(), 15);
    this.aliasText = this.add.text(textX, cardY - 14, displayName, {
      fontSize: displayName.length > 10 ? '20px' : '24px',
      color: '#dff8ff',
      fontStyle: 'bold',
      wordWrap: { width: textAreaW },
    }).setOrigin(0, 0.5).setDepth(7);

    // Edit name button
    const editNameBtn = this.add.text(textX, cardY + 32, '✎  Editar nombre', {
      fontSize: '13px',
      color: '#3fa8c2',
      backgroundColor: '#071620',
      padding: { x: 10, y: 6 },
    }).setOrigin(0, 0.5).setDepth(7).setInteractive({ useHandCursor: true });

    editNameBtn.on('pointerover', () => editNameBtn.setStyle({ color: '#96e3f8' }));
    editNameBtn.on('pointerout', () => editNameBtn.setStyle({ color: '#3fa8c2' }));
    editNameBtn.on('pointerdown', () => {
      const next = window.prompt('Alias de juego', getPlayerDisplayName());
      if (next === null) return;
      savePlayerAlias(next);
      const newDisplay = this.truncateName(getPlayerDisplayName(), 15);
      this.aliasText.setText(newDisplay);
      this.aliasText.setFontSize(newDisplay.length > 10 ? '20px' : '24px');
    });
  }

  private truncateName(name: string, maxLen: number): string {
    return name.length > maxLen ? name.slice(0, maxLen - 2) + '..' : name;
  }

  private createButtons(w: number, h: number) {
    const cx = w * 0.72;
    const btnW = Math.min(w * 0.30, 430);
    const btnH = Math.min(h * 0.148, 118);
    const gap = Math.min(h * 0.068, 54);
    const totalH = btnH * 2 + gap;
    // Center the button column vertically aligned with the player card area
    const startY = h * 0.57 - totalH / 2 + btnH / 2;

    const makeBtn = (key: string, y: number, action: () => void) => {
      const btn = this.add.image(cx, y, key)
        .setDepth(8)
        .setDisplaySize(btnW, btnH)
        .setInteractive({ useHandCursor: true });
      const glow = this.add.rectangle(cx, y, btnW + 26, btnH + 20, 0x52d7ff, 0)
        .setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      const shimmer = this.add.rectangle(cx - btnW / 2, y, 18, btnH * 0.72, 0xe7ffff, 0)
        .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);

      btn.on('pointerover', () => {
        btn.setTint(0xcdf8ff);
        this.tweens.add({ targets: glow, alpha: 0.28, duration: 140 });
        shimmer.setAlpha(0.50).setX(cx - btnW / 2 - 14);
        this.tweens.add({ targets: shimmer, x: cx + btnW / 2 + 14, alpha: 0, duration: 400 });
      });
      btn.on('pointerout', () => {
        btn.clearTint();
        this.tweens.add({ targets: glow, alpha: 0, duration: 180 });
      });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scaleX: 0.95, scaleY: 0.95, duration: 75, yoyo: true });
        this.emitButtonSpark(cx, y, btnW, btnH);
        action();
      });
    };

    makeBtn('btn-create', startY, () => socket.emit('createRoom', getClientIdentity()));
    makeBtn('btn-join', startY + btnH + gap, () => this.openJoinModal());
  }

  private openJoinModal() {
    if (this.joinModalObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    let code = '';
    const panelW = Math.min(w * 0.44, 550);
    const panelH = Math.min(h * 0.56, 390);
    const panelX = w / 2 - panelW / 2;
    const panelY = h / 2 - panelH / 2;

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.74)
      .setDepth(30).setInteractive();

    const panelG = this.add.graphics().setDepth(31);
    panelG.fillStyle(0x031120, 0.98);
    panelG.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panelG.lineStyle(1.5, 0x5ee8ff, 0.74);
    panelG.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);

    const title = this.add.text(w / 2, panelY + panelH * 0.17, 'UNIRSE A PARTIDA', {
      fontSize: '21px', color: '#b8f3ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(32);

    const inputBg = this.add.rectangle(w / 2, h / 2 - panelH * 0.04, Math.min(panelW * 0.68, 310), 54, 0x061a2a, 1)
      .setDepth(32).setStrokeStyle(1, 0x5ee8ff, 0.80).setInteractive({ useHandCursor: true });

    this.joinCodeText = this.add.text(w / 2, h / 2 - panelH * 0.04, '______', {
      fontSize: '28px', color: '#7ee8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(33);

    this.joinErrorText = this.add.text(w / 2, h / 2 + panelH * 0.18, '', {
      fontSize: '14px', color: '#ff9aaa',
    }).setOrigin(0.5).setDepth(33);

    inputBg.on('pointerdown', () => {
      const raw = window.prompt('Código de sala (6 caracteres)', code);
      if (raw === null) return;
      code = raw.trim().toUpperCase();
      this.joinCodeText?.setText((code || '______').slice(0, 8));
      this.joinErrorText?.setText('');
    });

    const btnY = panelY + panelH * 0.80;
    const joinBtn = this.add.rectangle(w / 2 - 85, btnY, 148, 44, 0x0d4d62, 0.98)
      .setDepth(32).setStrokeStyle(1, 0x5ee8ff, 1).setInteractive({ useHandCursor: true });
    const joinTxt = this.add.text(w / 2 - 85, btnY, 'UNIRSE', {
      fontSize: '17px', color: '#d0faff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(33);

    const cancelBtn = this.add.rectangle(w / 2 + 85, btnY, 148, 44, 0x0f1f2e, 0.98)
      .setDepth(32).setStrokeStyle(1, 0x3a7a90, 0.65).setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(w / 2 + 85, btnY, 'CANCELAR', {
      fontSize: '15px', color: '#6ac4d8',
    }).setOrigin(0.5).setDepth(33);

    joinBtn.on('pointerdown', () => {
      if (!code.trim()) {
        this.joinErrorText?.setText('Ingresá un código válido.');
        return;
      }
      socket.emit('joinRoom', { roomId: code.trim().toUpperCase(), identity: getClientIdentity() });
    });
    cancelBtn.on('pointerdown', () => this.closeJoinModal());
    overlay.on('pointerdown', () => this.closeJoinModal());

    this.joinModalObjects.push(
      overlay, panelG, title, inputBg,
      this.joinCodeText, this.joinErrorText,
      joinBtn, joinTxt, cancelBtn, cancelTxt,
    );
  }

  private closeJoinModal() {
    this.joinModalObjects.forEach((o) => o.destroy());
    this.joinModalObjects = [];
    this.joinCodeText = undefined;
    this.joinErrorText = undefined;
  }

  private openAvatarPicker(_avatarR: number) {
    if (this.pickerObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const panelW = Math.min(w * 0.88, 430);
    const panelH = Math.min(h * 0.72, 540);
    const panelX = cx - panelW / 2;
    const panelY = h / 2 - panelH / 2;

    const overlay = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.87)
      .setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeAvatarPicker());

    const panelG = this.add.graphics().setDepth(26);
    panelG.fillStyle(0x030e1a, 0.98);
    panelG.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panelG.lineStyle(1.5, 0x5ee8ff, 0.76);
    panelG.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);

    const header = this.add.text(cx, panelY + 26, 'ELEGÍ TU PERSONAJE', {
      fontSize: '12px', color: '#5ee8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(27);

    const cellSize = Math.min((panelW - 52) / 3, (panelH - 114) / 3);
    const thumbR = Math.floor(cellSize * 0.42);
    // Match the same overscan ratio used by the main avatar display
    const thumbDisplaySize = thumbR * 2.85;
    const gridStartX = cx - cellSize;
    const gridStartY = panelY + 80 + cellSize / 2;

    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const tx = gridStartX + col * cellSize;
      const ty = gridStartY + row * cellSize;

      const mG = this.add.graphics().setVisible(false).setDepth(27);
      mG.fillStyle(0xffffff).fillCircle(tx, ty, thumbR * 0.94);

      const thumb = this.add.image(tx, ty, 'avatars', String(i))
        .setDisplaySize(thumbDisplaySize, thumbDisplaySize)
        .setMask(mG.createGeometryMask())
        .setDepth(28)
        .setInteractive({ useHandCursor: true });

      thumb.on('pointerover', () => thumb.setTint(0xd0f8ff));
      thumb.on('pointerout', () => thumb.clearTint());
      thumb.on('pointerdown', () => {
        saveAvatarIndex(i);
        this.avatarImage
          .setTexture('avatars', String(i))
          .setDisplaySize(this.avatarDisplaySize, this.avatarDisplaySize);
        this.closeAvatarPicker();
      });

      this.pickerObjects.push(mG, thumb);
    }

    this.pickerObjects.push(overlay, panelG, header);
  }

  private closeAvatarPicker() {
    this.pickerObjects.forEach((o) => o.destroy());
    this.pickerObjects = [];
  }

  private registerSocketEvents() {
    socket.off('roomCreated');
    socket.off('roomJoined');
    socket.off('roomError');

    socket.on('roomCreated', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.closeJoinModal();
      this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants });
    });
    socket.on('roomJoined', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.closeJoinModal();
      this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants });
    });
    socket.on('roomError', (data: { message: string }) => this.joinErrorText?.setText(data.message));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('roomError');
    });
  }

  private emitButtonSpark(cx: number, cy: number, bw: number, bh: number) {
    for (let i = 0; i < 10; i++) {
      const spark = this.add.circle(
        cx + Phaser.Math.Between(-bw / 2, bw / 2),
        cy + Phaser.Math.Between(-bh / 2, bh / 2),
        Phaser.Math.FloatBetween(1.6, 3.8),
        0xbdefff,
        1
      ).setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        y: spark.y - Phaser.Math.Between(10, 34),
        duration: 340,
        onComplete: () => spark.destroy(),
      });
    }
  }
}
