import Phaser from 'phaser';
import { socket } from '../network/socket';
import { getClientIdentity } from '../telegram/telegram';

type ParticipantData = { name: string; ready: boolean; isHost: boolean };

export class LobbyScene extends Phaser.Scene {
  private roomId = '';
  private isHost = false;
  private participants: Record<string, ParticipantData> = {};
  private participantRows: Phaser.GameObjects.GameObject[] = [];
  private readyBtnText!: Phaser.GameObjects.Text;
  private startBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private startBtnText: Phaser.GameObjects.Text | null = null;
  private panelW = 0;

  constructor() { super('LobbyScene'); }

  create() {
    const data = this.scene.settings.data as {
      roomId: string;
      isHost: boolean;
      participants: Record<string, ParticipantData>;
    };
    this.roomId = data.roomId ?? '';
    this.isHost = data.isHost ?? false;
    this.participants = data.participants ?? {};

    const { width: w, height: h } = this.scale;
    this.panelW = Math.min(w * 0.84, 430);

    this.createBackground(w, h);
    this.createRoomHeader(w, h);
    this.renderParticipants();
    this.createActionButtons(w, h);
    this.updateButtonStates();
    this.registerSocketEvents();
  }

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(w / 2, h / 2, 'loading-background')
      .setScale(Math.max(w / 1600, h / 900)).setDepth(-20);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.65).setDepth(-10);
    this.tweens.add({ targets: bg, scale: bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });
    this.drawFrameCorners(w, h);
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x5ee8ff, 0.28);
    const m = 14, s = 20;
    g.lineBetween(m, m, m + s, m);         g.lineBetween(m, m, m, m + s);
    g.lineBetween(w - m, m, w - m - s, m); g.lineBetween(w - m, m, w - m, m + s);
    g.lineBetween(m, h - m, m + s, h - m); g.lineBetween(m, h - m, m, h - m - s);
    g.lineBetween(w - m, h - m, w - m - s, h - m); g.lineBetween(w - m, h - m, w - m, h - m - s);
  }

  private createRoomHeader(w: number, h: number) {
    const cx = w / 2;

    this.add.text(cx, h * 0.09, 'SALA', {
      fontSize: '12px', color: '#4a8a9a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    const codeFs = Math.max(26, Math.round(Math.min(w * 0.08, 40)));
    this.add.text(cx, h * 0.155, this.roomId, {
      fontSize: `${codeFs}px`, color: '#dff8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 10).setDepth(3);

    const copyBtn = this.add.text(cx, h * 0.215, '[ COPIAR CÓDIGO ]', {
      fontSize: '11px', color: '#5ee8ff',
    }).setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true });
    copyBtn.on('pointerdown', () => {
      navigator.clipboard?.writeText(this.roomId).catch(() => {});
      this.showToast('¡Código copiado!');
    });

    const g = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.55, 260);
    g.lineStyle(1, 0x5ee8ff, 0.3);
    g.lineBetween(cx - sepW / 2, h * 0.26, cx + sepW / 2, h * 0.26);

    const count = Object.keys(this.participants).length;
    this.add.text(cx, h * 0.29, `JUGADORES (${count}/4)`, {
      fontSize: '11px', color: '#3a7a8a',
    }).setOrigin(0.5).setDepth(3);
  }

  private renderParticipants() {
    this.participantRows.forEach((o) => o.destroy());
    this.participantRows = [];

    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const startY = h * 0.355;
    const rowH = 38;
    const rowGap = 8;
    const myId = getClientIdentity().id;

    Object.entries(this.participants).forEach(([playerId, p], i) => {
      const isMe = playerId === myId;
      const rowY = startY + i * (rowH + rowGap);
      const rowInnerW = this.panelW - 24;

      const rowBg = this.add.rectangle(cx, rowY, rowInnerW, rowH, 0x030c18, 0.82)
        .setStrokeStyle(1, isMe ? 0x5ee8ff : 0x1a4458, 0.55).setDepth(5);
      const nameStr = (p.isHost ? '♔ ' : '') + p.name + (isMe ? ' (tú)' : '');
      const nameTxt = this.add.text(cx - rowInnerW / 2 + 14, rowY, nameStr, {
        fontSize: '13px', color: isMe ? '#c8f8ff' : '#7aadc0',
      }).setOrigin(0, 0.5).setDepth(6);
      const statusTxt = this.add.text(cx + rowInnerW / 2 - 14, rowY,
        p.ready ? '✓ LISTO' : '...', {
          fontSize: '12px', color: p.ready ? '#5ff5aa' : '#2e5a6e',
        }).setOrigin(1, 0.5).setDepth(6);

      this.participantRows.push(rowBg, nameTxt, statusTxt);
    });
  }

  private createActionButtons(w: number, h: number) {
    const cx = w / 2;
    const btnW = Math.min(w * 0.78, 380);
    const btnH = 44;

    const readyY = this.isHost ? h * 0.69 : h * 0.76;

    // LISTO button
    const readyBg = this.add.rectangle(cx, readyY, btnW, btnH, 0x0d4d62, 0.97)
      .setStrokeStyle(2, 0x5ee8ff, 0.9).setDepth(8).setInteractive({ useHandCursor: true });
    const readyTxt = this.add.text(cx, readyY, 'LISTO', {
      fontSize: '15px', color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    this.readyBtnText = readyTxt;

    readyBg.on('pointerover', () => readyBg.setFillStyle(0x145f78, 0.97));
    readyBg.on('pointerout', () => readyBg.setFillStyle(0x0d4d62, 0.97));
    readyBg.on('pointerdown', () => {
      this.tweens.add({ targets: [readyBg, readyTxt], alpha: 0.6, yoyo: true, duration: 80 });
      socket.emit('toggleReady', { roomId: this.roomId, playerId: getClientIdentity().id });
    });

    // INICIAR button (host only)
    if (this.isHost) {
      const startY = h * 0.79;
      const startBg = this.add.rectangle(cx, startY, btnW, btnH, 0x0a1a24, 0.97)
        .setStrokeStyle(1.5, 0x3a7a8a, 0.5).setDepth(8).setInteractive({ useHandCursor: true });
      const startTxt = this.add.text(cx, startY, 'INICIAR PARTIDA', {
        fontSize: '14px', color: '#3a7a8a', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(9);
      this.startBtnBg = startBg;
      this.startBtnText = startTxt;

      startBg.on('pointerover', () => {
        if (this.canStart()) startBg.setFillStyle(0x145f78, 0.97);
      });
      startBg.on('pointerout', () => {
        startBg.setFillStyle(this.canStart() ? 0x0d4d62 : 0x0a1a24, 0.97);
      });
      startBg.on('pointerdown', () => {
        if (!this.canStart()) return;
        this.tweens.add({ targets: [startBg, startTxt], alpha: 0.6, yoyo: true, duration: 80 });
        socket.emit('startGame', { roomId: this.roomId });
      });
    }

    // SALIR button
    const backY = this.isHost ? h * 0.9 : h * 0.87;
    const backBg = this.add.rectangle(cx, backY, Math.min(btnW * 0.65, 240), 36, 0x050e1a, 0.9)
      .setStrokeStyle(1, 0x5ee8ff, 0.35).setDepth(8).setInteractive({ useHandCursor: true });
    const backTxt = this.add.text(cx, backY, '← SALIR DE SALA', { fontSize: '12px', color: '#6ab8cc' })
      .setOrigin(0.5).setDepth(9);

    backBg.on('pointerover', () => backBg.setFillStyle(0x0a1d2c, 0.9));
    backBg.on('pointerout', () => backBg.setFillStyle(0x050e1a, 0.9));
    backBg.on('pointerdown', () => {
      this.tweens.add({ targets: [backBg, backTxt], alpha: 0.6, yoyo: true, duration: 80 });
      socket.emit('leaveRoom', { roomId: this.roomId, playerId: getClientIdentity().id });
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
    });
  }

  private canStart(): boolean {
    const parts = Object.values(this.participants);
    return parts.length >= 1 && parts.every((p) => p.ready);
  }

  private updateButtonStates() {
    const myId = getClientIdentity().id;
    const isReady = this.participants[myId]?.ready ?? false;
    if (this.readyBtnText) this.readyBtnText.setText(isReady ? 'CANCELAR LISTO' : 'LISTO');

    if (this.startBtnBg && this.startBtnText) {
      const enabled = this.canStart();
      this.startBtnBg.setFillStyle(enabled ? 0x0d4d62 : 0x0a1a24, 0.97);
      this.startBtnBg.setStrokeStyle(1.5, enabled ? 0x5ee8ff : 0x3a7a8a, enabled ? 0.9 : 0.5);
      this.startBtnText.setColor(enabled ? '#d4fbff' : '#3a7a8a');
    }
  }

  private registerSocketEvents() {
    socket.off('participantsUpdated');
    socket.off('gameStart');
    socket.off('hostLeft');

    socket.on('participantsUpdated', (data: { participants: Record<string, ParticipantData> }) => {
      this.participants = data.participants;
      this.renderParticipants();
      this.updateButtonStates();
    });

    socket.on('gameStart', () => {
      this.cameras.main.fadeOut(320, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('GameScene', { roomId: this.roomId }),
      );
    });

    socket.on('hostLeft', () => {
      this.showToast('El host abandonó la sala');
      this.time.delayedCall(1800, () => {
        this.cameras.main.fadeOut(260, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
      });
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off('participantsUpdated');
      socket.off('gameStart');
      socket.off('hostLeft');
    });
  }

  private showToast(message: string) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height * 0.955, message, {
      fontSize: '13px', color: '#dff8ff', backgroundColor: 'rgba(1,8,16,0.88)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 12, duration: 2000, onComplete: () => t.destroy() });
  }
}
