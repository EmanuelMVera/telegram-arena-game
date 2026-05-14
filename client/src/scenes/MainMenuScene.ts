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
    this.createLogo(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
  }

  private registerAvatarFrames() {
    if (this.framesRegistered) return;
    const tex = this.textures.get('avatars');
    const src = tex.getSourceImage() as HTMLImageElement;
    const fw = Math.floor(src.width / 3);
    const fh = Math.floor(src.height / 3);
    for (let i = 0; i < 9; i++) if (!tex.has(String(i))) tex.add(String(i), 0, (i % 3) * fw, Math.floor(i / 3) * fh, fw, fh);
    this.framesRegistered = true;
  }

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#030810');
    const bg = this.add.image(w / 2, h / 2, 'bg-desktop').setDepth(-20);
    bg.setScale(Math.max(w / bg.width, h / bg.height));
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.3).setDepth(-10);

    for (let i = 0; i < 28; i++) {
      const p = this.add.circle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), Phaser.Math.FloatBetween(1, 2.8), 0x66e8ff, Phaser.Math.FloatBetween(0.12, 0.45))
        .setDepth(-6).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(35, 120),
        x: p.x + Phaser.Math.Between(-18, 18),
        alpha: 0,
        duration: Phaser.Math.Between(2800, 6500),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3400),
        onRepeat: () => p.setPosition(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h)).setAlpha(Phaser.Math.FloatBetween(0.12, 0.45)),
      });
    }
  }

  private createLogo(w: number, h: number) {
    const logo = this.add.image(w * 0.5, h * 0.16, 'logo').setDepth(5);
    const maxW = Math.min(w * 0.38, 440);
    const ratio = logo.width / logo.height;
    logo.setDisplaySize(maxW, maxW / ratio);
    logo.setAlpha(0.95);
  }

  private createPlayerCard(w: number, h: number) {
    const cardX = w * 0.30;
    const cardY = h * 0.53;
    const cardW = Math.min(w * 0.34, 460);
    const cardH = Math.min(h * 0.40, 320);
    const avatarR = Math.max(60, Math.min(90, Math.round(h * 0.10)));

    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x020c18, 0.82);
    g.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);
    g.lineStyle(1, 0x5ee8ff, 0.45);
    g.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);

    const avatarX = cardX;
    const avatarY = cardY - 30;
    const ringSize = avatarR * 2.5;
    const maskGraphics = this.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1).fillCircle(avatarX, avatarY, ringSize * 0.39);

    this.avatarImage = this.add.image(avatarX, avatarY, 'avatars', String(getSavedAvatarIndex())).setDepth(6).setDisplaySize(ringSize * 0.98, ringSize * 0.98);
    this.avatarImage.setMask(maskGraphics.createGeometryMask());

    const ring = this.add.image(avatarX, avatarY, 'avatar-ring').setDepth(7).setDisplaySize(ringSize, ringSize);
    this.tweens.add({ targets: ring, alpha: { from: 0.85, to: 1 }, duration: 2200, yoyo: true, repeat: -1 });

    const editAvatar = this.add.text(avatarX + ringSize * 0.35, avatarY + ringSize * 0.30, '✎', {
      fontSize: '18px', color: '#d6fbff', backgroundColor: '#103344', padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(9).setInteractive({ useHandCursor: true });
    editAvatar.on('pointerdown', () => this.openAvatarPicker(avatarR));

    const aliasY = cardY + avatarR + 6;
    this.aliasText = this.add.text(avatarX, aliasY, `${getPlayerDisplayName()}  ✎`, {
      fontSize: '24px', color: '#e8feff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(7).setInteractive({ useHandCursor: true });
    this.aliasText.on('pointerdown', () => {
      const next = window.prompt('Alias de juego', getPlayerDisplayName());
      if (next === null) return;
      savePlayerAlias(next);
      this.aliasText.setText(`${getPlayerDisplayName()}  ✎`);
    });
  }

  private createButtons(w: number, h: number) {
    const cx = w * 0.72;
    const baseY = h * 0.47;
    const btnW = Math.min(w * 0.31, 400);
    const btnH = Math.min(h * 0.15, 118);

    const makeBtn = (key: string, y: number, action: () => void) => {
      const btn = this.add.image(cx, y, key).setDepth(8).setDisplaySize(btnW, btnH).setInteractive({ useHandCursor: true });
      const glow = this.add.rectangle(cx, y, btnW + 24, btnH + 20, 0x44ccff, 0).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      const shimmer = this.add.rectangle(cx - btnW / 2, y, 18, btnH * 0.72, 0xd8ffff, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);

      btn.on('pointerover', () => {
        btn.setTint(0xc9f7ff);
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 150 });
        shimmer.setAlpha(0.55).setX(cx - btnW / 2 - 12);
        this.tweens.add({ targets: shimmer, x: cx + btnW / 2 + 12, alpha: 0, duration: 380 });
      });
      btn.on('pointerout', () => { btn.clearTint(); this.tweens.add({ targets: glow, alpha: 0, duration: 180 }); });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scaleX: 0.96, scaleY: 0.96, duration: 70, yoyo: true });
        this.emitButtonSpark(cx, y, btnW, btnH);
        action();
      });
    };

    makeBtn('btn-create', baseY, () => socket.emit('createRoom', getClientIdentity()));
    makeBtn('btn-join', baseY + btnH + 28, () => this.openJoinModal());
  }

  private openJoinModal() {
    if (this.joinModalObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    let code = '';

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72).setDepth(30).setInteractive();
    const panel = this.add.rectangle(w / 2, h / 2, Math.min(w * 0.42, 520), Math.min(h * 0.52, 360), 0x031120, 0.96)
      .setDepth(31).setStrokeStyle(2, 0x5ee8ff, 0.78);
    const title = this.add.text(w / 2, h * 0.37, 'UNIRSE A PARTIDA', { fontSize: '26px', color: '#c6f7ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);

    const inputBg = this.add.rectangle(w / 2, h * 0.48, 280, 54, 0x061a2a, 1).setDepth(32).setStrokeStyle(1, 0x5ee8ff, 0.8).setInteractive({ useHandCursor: true });
    this.joinCodeText = this.add.text(w / 2, h * 0.48, '______', { fontSize: '30px', color: '#90ecff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(33);
    this.joinErrorText = this.add.text(w / 2, h * 0.56, '', { fontSize: '16px', color: '#ff9ba8' }).setOrigin(0.5).setDepth(33);

    inputBg.on('pointerdown', () => {
      const raw = window.prompt('Código de sala (6 caracteres)', code);
      if (raw === null) return;
      code = raw.trim().toUpperCase();
      this.joinCodeText?.setText((code || '______').slice(0, 8));
      this.joinErrorText?.setText('');
    });

    const joinBtn = this.add.rectangle(w / 2 - 90, h * 0.66, 150, 44, 0x0d4d62, 0.98).setDepth(32).setStrokeStyle(1, 0x5ee8ff, 1).setInteractive({ useHandCursor: true });
    const joinTxt = this.add.text(w / 2 - 90, h * 0.66, 'UNIRSE', { fontSize: '18px', color: '#d5fbff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(33);
    const cancelBtn = this.add.rectangle(w / 2 + 90, h * 0.66, 150, 44, 0x112030, 0.98).setDepth(32).setStrokeStyle(1, 0x5ee8ff, 0.6).setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(w / 2 + 90, h * 0.66, 'CANCELAR', { fontSize: '16px', color: '#a9d7e5' }).setOrigin(0.5).setDepth(33);

    joinBtn.on('pointerdown', () => {
      if (!code.trim()) {
        this.joinErrorText?.setText('Ingresá un código válido.');
        return;
      }
      socket.emit('joinRoom', { roomId: code.trim().toUpperCase(), identity: getClientIdentity() });
    });
    cancelBtn.on('pointerdown', () => this.closeJoinModal());
    overlay.on('pointerdown', () => this.closeJoinModal());

    this.joinModalObjects.push(overlay, panel, title, inputBg, this.joinCodeText, this.joinErrorText, joinBtn, joinTxt, cancelBtn, cancelTxt);
  }

  private closeJoinModal() {
    this.joinModalObjects.forEach((o) => o.destroy());
    this.joinModalObjects = [];
    this.joinCodeText = undefined;
    this.joinErrorText = undefined;
  }

  private openAvatarPicker(avatarR: number) { /* unchanged feature */
    if (this.pickerObjects.length > 0) return;
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const avatarDisplaySize = avatarR * 2.401;
    const overlay = this.add.rectangle(cx, h / 2, w, h, 0x000000, 0.84).setDepth(25).setInteractive();
    overlay.on('pointerdown', () => this.closeAvatarPicker());
    const panelW = Math.min(w * 0.9, 400); const panelH = Math.min(h * 0.66, 510);
    const panelG = this.add.graphics().setDepth(26);
    panelG.fillStyle(0x030e1a, 0.97); panelG.fillRoundedRect(cx - panelW / 2, h / 2 - panelH / 2, panelW, panelH, 10);
    panelG.lineStyle(1.5, 0x5ee8ff, 0.8); panelG.strokeRoundedRect(cx - panelW / 2, h / 2 - panelH / 2, panelW, panelH, 10);
    const header = this.add.text(cx, h / 2 - panelH / 2 + 28, 'ELEGÍ TU PERSONAJE', { fontSize: '13px', color: '#5ee8ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(27);
    const cellSize = Math.min((panelW - 44) / 3, (panelH - 120) / 3); const thumbR = Math.floor(cellSize * 0.44);
    const gridStartX = cx - cellSize; const gridStartY = h / 2 - panelH / 2 + 82 + cellSize / 2;
    for (let i = 0; i < 9; i++) {
      const col = i % 3, row = Math.floor(i / 3), tx = gridStartX + col * cellSize, ty = gridStartY + row * cellSize;
      const mG = this.add.graphics().setVisible(false); mG.fillStyle(0xffffff).fillCircle(tx, ty, thumbR * 0.95);
      const thumb = this.add.image(tx, ty, 'avatars', String(i)).setDisplaySize(thumbR * 2.45, thumbR * 2.45).setMask(mG.createGeometryMask()).setDepth(28).setInteractive({ useHandCursor: true });
      thumb.on('pointerdown', () => { saveAvatarIndex(i); this.avatarImage.setTexture('avatars', String(i)).setDisplaySize(avatarDisplaySize, avatarDisplaySize); this.closeAvatarPicker(); });
      this.pickerObjects.push(mG, thumb);
    }
    this.pickerObjects.push(overlay, panelG, header);
  }

  private closeAvatarPicker() { this.pickerObjects.forEach((o) => o.destroy()); this.pickerObjects = []; }

  private registerSocketEvents() {
    socket.off('roomCreated'); socket.off('roomJoined'); socket.off('roomError');
    socket.on('roomCreated', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.closeJoinModal();
      this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants });
    });
    socket.on('roomJoined', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.closeJoinModal();
      this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants });
    });
    socket.on('roomError', (data: { message: string }) => this.joinErrorText?.setText(data.message));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { socket.off('roomCreated'); socket.off('roomJoined'); socket.off('roomError'); });
  }

  private emitButtonSpark(cx: number, cy: number, bw: number, bh: number) {
    for (let i = 0; i < 10; i++) {
      const spark = this.add.circle(cx + Phaser.Math.Between(-bw / 2, bw / 2), cy + Phaser.Math.Between(-bh / 2, bh / 2), Phaser.Math.FloatBetween(1.8, 4), 0xbdefff, 1)
        .setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: spark, alpha: 0, y: spark.y - Phaser.Math.Between(12, 36), duration: 360, onComplete: () => spark.destroy() });
    }
  }
}
