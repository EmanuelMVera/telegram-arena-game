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
    this.createAmbientFx(width, height);
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
    this.cameras.main.setBackgroundColor('#020813');
    const bg = this.add.image(w / 2, h / 2, 'bg-desktop').setDepth(-20);
    bg.setScale(Math.max(w / bg.width, h / bg.height));
    this.add.rectangle(w / 2, h / 2, w, h, 0x020914, 0.35).setDepth(-10);
  }

  private createAmbientFx(w: number, h: number) {
    for (let i = 0; i < 24; i++) {
      const p = this.add.circle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), Phaser.Math.FloatBetween(1, 3), 0x66e8ff, Phaser.Math.FloatBetween(0.15, 0.32))
        .setDepth(-6).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(30, 110),
        x: p.x + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6500),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2400),
        onRepeat: () => p.setPosition(Phaser.Math.Between(0, w), Phaser.Math.Between(h * 0.15, h)).setAlpha(Phaser.Math.FloatBetween(0.1, 0.34)),
      });
    }
  }

  private createLogo(w: number, h: number) {
    const logo = this.add.image(w * 0.5, h * 0.17, 'logo').setDepth(5);
    const maxW = Math.min(w * 0.34, 520);
    logo.setDisplaySize(maxW, (maxW / logo.width) * logo.height);
    logo.setAlpha(0.97);
  }

  private createPlayerCard(w: number, h: number) {
    const cardX = w * 0.3;
    const cardY = h * 0.57;
    const cardW = Math.min(w * 0.36, 520);
    const cardH = Math.min(h * 0.34, 300);
    const avatarR = Math.max(60, Math.min(96, Math.round(h * 0.095)));

    const card = this.add.graphics().setDepth(4);
    card.fillStyle(0x030f1b, 0.84);
    card.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 16);
    card.lineStyle(2, 0x5ee8ff, 0.36);
    card.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 16);

    const avatarX = cardX - cardW * 0.22;
    const avatarY = cardY - 6;
    const ringSize = avatarR * 2.45;

    const avatarMaskG = this.add.graphics().setVisible(false);
    avatarMaskG.fillStyle(0xffffff, 1).fillCircle(avatarX, avatarY, ringSize * 0.4);

    this.avatarImage = this.add.image(avatarX, avatarY, 'avatars', String(getSavedAvatarIndex())).setDepth(6).setDisplaySize(ringSize * 0.96, ringSize * 0.96);
    this.avatarImage.setMask(avatarMaskG.createGeometryMask());

    const ring = this.add.image(avatarX, avatarY, 'avatar-ring').setDepth(8).setDisplaySize(ringSize, ringSize);
    this.tweens.add({ targets: ring, alpha: { from: 0.84, to: 1 }, duration: 1900, yoyo: true, repeat: -1 });

    const avatarEdit = this.add.text(avatarX + ringSize * 0.34, avatarY + ringSize * 0.30, '✎', {
      fontSize: '18px', color: '#d7fbff', backgroundColor: '#12374a', padding: { x: 6, y: 2 },
    }).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
    avatarEdit.on('pointerdown', () => this.openAvatarPicker(avatarR));

    this.aliasText = this.add.text(cardX + cardW * 0.07, avatarY + 8, `${getPlayerDisplayName()} ✎`, {
      fontSize: '30px', color: '#e9feff', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(7).setInteractive({ useHandCursor: true });
    this.aliasText.on('pointerdown', () => {
      const next = window.prompt('Alias de juego', getPlayerDisplayName());
      if (next === null) return;
      savePlayerAlias(next);
      this.aliasText.setText(`${getPlayerDisplayName()} ✎`);
    });
  }

  private createButtons(w: number, h: number) {
    const cx = w * 0.73;
    const baseY = h * 0.49;
    const btnW = Math.min(w * 0.31, 410);
    const btnH = Math.min(h * 0.15, 120);

    const makeBtn = (key: string, y: number, action: () => void) => {
      const btn = this.add.image(cx, y, key).setDepth(8).setDisplaySize(btnW, btnH).setInteractive({ useHandCursor: true });
      const glow = this.add.rectangle(cx, y, btnW + 26, btnH + 22, 0x52d7ff, 0).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      const shimmer = this.add.rectangle(cx - btnW / 2, y, 20, btnH * 0.76, 0xe7ffff, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);

      btn.on('pointerover', () => {
        btn.setTint(0xcdf8ff);
        this.tweens.add({ targets: glow, alpha: 0.32, duration: 140 });
        shimmer.setAlpha(0.55).setX(cx - btnW / 2 - 14);
        this.tweens.add({ targets: shimmer, x: cx + btnW / 2 + 14, alpha: 0, duration: 390 });
      });
      btn.on('pointerout', () => { btn.clearTint(); this.tweens.add({ targets: glow, alpha: 0, duration: 180 }); });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scaleX: 0.96, scaleY: 0.96, duration: 80, yoyo: true });
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
    const panelW = Math.min(w * 0.4, 520);

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72).setDepth(30).setInteractive();
    const panel = this.add.rectangle(w / 2, h / 2, panelW, Math.min(h * 0.52, 360), 0x031120, 0.97).setDepth(31).setStrokeStyle(2, 0x5ee8ff, 0.78);
    const title = this.add.text(w / 2, h * 0.37, 'UNIRSE A PARTIDA', { fontSize: '26px', color: '#c6f7ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);

    const inputBg = this.add.rectangle(w / 2, h * 0.48, Math.min(panelW * 0.68, 300), 56, 0x061a2a, 1).setDepth(32).setStrokeStyle(1, 0x5ee8ff, 0.85).setInteractive({ useHandCursor: true });
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

  private openAvatarPicker(avatarR: number) {
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
