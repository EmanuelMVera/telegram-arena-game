import Phaser from 'phaser';
import { socket } from '../network/socket';
import { getClientIdentity } from '../telegram/telegram';

type ParticipantData = { name: string; ready: boolean; isHost: boolean };

export class CreateJoinScene extends Phaser.Scene {
  private activeTab: 'create' | 'join' = 'create';
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private tabBgs: { create: Phaser.GameObjects.Rectangle; join: Phaser.GameObjects.Rectangle } | null = null;
  private tabTexts: { create: Phaser.GameObjects.Text; join: Phaser.GameObjects.Text } | null = null;

  constructor() { super('CreateJoinScene'); }

  create() {
    const data = this.scene.settings.data as { mode?: 'create' | 'join' } | null;
    this.activeTab = data?.mode ?? 'create';

    const { width: w, height: h } = this.scale;
    this.createBackground(w, h);
    this.createTitle(w, h);
    this.createTabs(w, h);
    this.renderContent();
    this.createBackButton(w, h);
    this.registerSocketEvents();
  }

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(w / 2, h / 2, 'BG-Desktop.png')
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

  private createTitle(w: number, h: number) {
    const cx = w / 2;
    const fs = Math.max(22, Math.round(Math.min(w * 0.06, 30)));
    this.add.text(cx, h * 0.11, 'NUEVA PARTIDA', {
      fontSize: `${fs}px`, color: '#a7f7ff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 12).setDepth(3);

    const g = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.45, 220);
    g.lineStyle(1, 0x5ee8ff, 0.35);
    g.lineBetween(cx - sepW / 2, h * 0.17, cx + sepW / 2, h * 0.17);
  }

  private createTabs(w: number, h: number) {
    const cx = w / 2;
    const tabW = Math.min(w * 0.36, 155);
    const tabH = 36;
    const tabY = h * 0.24;
    const gap = 10;
    const fs = Math.max(12, Math.round(Math.min(w * 0.032, 15)));

    const createBg = this.add.rectangle(cx - tabW / 2 - gap / 2, tabY, tabW, tabH, 0x0d4d62, 0.97)
      .setStrokeStyle(1.5, 0x5ee8ff, 1.0).setDepth(5).setInteractive({ useHandCursor: true });
    const joinBg = this.add.rectangle(cx + tabW / 2 + gap / 2, tabY, tabW, tabH, 0x060f1a, 0.97)
      .setStrokeStyle(1.5, 0x5ee8ff, 0.35).setDepth(5).setInteractive({ useHandCursor: true });

    const createTxt = this.add.text(cx - tabW / 2 - gap / 2, tabY, 'CREAR SALA', {
      fontSize: `${fs}px`, color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);
    const joinTxt = this.add.text(cx + tabW / 2 + gap / 2, tabY, 'UNIRSE', {
      fontSize: `${fs}px`, color: '#6ab8cc', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);

    this.tabBgs = { create: createBg, join: joinBg };
    this.tabTexts = { create: createTxt, join: joinTxt };

    createBg.on('pointerdown', () => {
      this.activeTab = 'create';
      this.refreshTabs();
      this.renderContent();
    });
    joinBg.on('pointerdown', () => {
      this.activeTab = 'join';
      this.refreshTabs();
      this.renderContent();
    });

    this.refreshTabs();
  }

  private refreshTabs() {
    if (!this.tabBgs || !this.tabTexts) return;
    const a = this.activeTab;
    this.tabBgs.create.setFillStyle(a === 'create' ? 0x0d4d62 : 0x060f1a, 0.97);
    this.tabBgs.create.setStrokeStyle(1.5, 0x5ee8ff, a === 'create' ? 1.0 : 0.35);
    this.tabBgs.join.setFillStyle(a === 'join' ? 0x0d4d62 : 0x060f1a, 0.97);
    this.tabBgs.join.setStrokeStyle(1.5, 0x5ee8ff, a === 'join' ? 1.0 : 0.35);
    this.tabTexts.create.setColor(a === 'create' ? '#d4fbff' : '#6ab8cc');
    this.tabTexts.join.setColor(a === 'join' ? '#d4fbff' : '#6ab8cc');
  }

  private renderContent() {
    this.contentObjects.forEach((o) => o.destroy());
    this.contentObjects = [];

    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const panelW = Math.min(w * 0.84, 420);
    const panelCy = h * 0.51;
    const panelH = Math.min(h * 0.34, 200);

    const panel = this.add.rectangle(cx, panelCy, panelW, panelH, 0x020811, 0.52)
      .setStrokeStyle(1, 0x5ee8ff, 0.38).setDepth(4);
    this.contentObjects.push(panel);

    const descFs = Math.max(11, Math.round(Math.min(w * 0.03, 14)));
    const btnW = Math.min(panelW * 0.72, 290);
    const btnH = 44;
    const descY = panelCy - panelH * 0.26;
    const btnY = panelCy + panelH * 0.24;

    if (this.activeTab === 'create') {
      const desc = this.add.text(cx, descY,
        'Genera un código único y\ncompártelo con tus amigos.', {
          fontSize: `${descFs}px`, color: '#7abccf', align: 'center', lineSpacing: 5,
        }).setOrigin(0.5).setDepth(5);

      const btnBg = this.add.rectangle(cx, btnY, btnW, btnH, 0x0d4d62, 0.97)
        .setStrokeStyle(2, 0x5ee8ff, 1.0).setDepth(5).setInteractive({ useHandCursor: true });
      const btnTxt = this.add.text(cx, btnY, 'CREAR SALA', {
        fontSize: '15px', color: '#d4fbff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x145f78, 0.97));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x0d4d62, 0.97));
      btnBg.on('pointerdown', () => {
        this.tweens.add({ targets: [btnBg, btnTxt], alpha: 0.6, yoyo: true, duration: 80 });
        socket.emit('createRoom', getClientIdentity());
      });

      this.contentObjects.push(desc, btnBg, btnTxt);
    } else {
      const desc = this.add.text(cx, descY,
        'Ingresá el código de sala\nque te compartieron.', {
          fontSize: `${descFs}px`, color: '#7abccf', align: 'center', lineSpacing: 5,
        }).setOrigin(0.5).setDepth(5);

      const btnBg = this.add.rectangle(cx, btnY, btnW, btnH, 0x0d4d62, 0.97)
        .setStrokeStyle(2, 0x5ee8ff, 1.0).setDepth(5).setInteractive({ useHandCursor: true });
      const btnTxt = this.add.text(cx, btnY, 'INGRESAR CÓDIGO', {
        fontSize: '15px', color: '#d4fbff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x145f78, 0.97));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x0d4d62, 0.97));
      btnBg.on('pointerdown', () => {
        this.tweens.add({ targets: [btnBg, btnTxt], alpha: 0.6, yoyo: true, duration: 80 });
        const raw = window.prompt('Código de sala (6 caracteres)');
        if (!raw) return;
        socket.emit('joinRoom', { roomId: raw.trim().toUpperCase(), identity: getClientIdentity() });
      });

      this.contentObjects.push(desc, btnBg, btnTxt);
    }
  }

  private createBackButton(w: number, h: number) {
    const cx = w / 2;
    const btnW = Math.min(w * 0.58, 230);
    const btnY = h * 0.86;
    const bg = this.add.rectangle(cx, btnY, btnW, 36, 0x050e1a, 0.9)
      .setStrokeStyle(1, 0x5ee8ff, 0.38).setDepth(5).setInteractive({ useHandCursor: true });
    const txt = this.add.text(cx, btnY, '← VOLVER AL MENÚ', { fontSize: '12px', color: '#6ab8cc' })
      .setOrigin(0.5).setDepth(6);

    bg.on('pointerover', () => bg.setFillStyle(0x0a1d2c, 0.9));
    bg.on('pointerout', () => bg.setFillStyle(0x050e1a, 0.9));
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: [bg, txt], alpha: 0.6, yoyo: true, duration: 80 });
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
    });
  }

  private registerSocketEvents() {
    socket.off('roomCreated');
    socket.off('roomJoined');
    socket.off('roomError');

    socket.on('roomCreated', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants }),
      );
    });

    socket.on('roomJoined', (data: { roomId: string; participants: Record<string, ParticipantData>; isHost: boolean }) => {
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('LobbyScene', { roomId: data.roomId, isHost: data.isHost, participants: data.participants }),
      );
    });

    socket.on('roomError', (data: { message: string }) => {
      this.showToast(data.message);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('roomError');
    });
  }

  private showToast(message: string) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height * 0.76, message, {
      fontSize: '13px', color: '#ffd0d0', backgroundColor: 'rgba(1,8,16,0.88)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 14, duration: 2200, onComplete: () => t.destroy() });
  }
}
