import Phaser from 'phaser';
import { socket } from '../network/socket';
import { getClientIdentity } from '../telegram/telegram';
import { getLayout, applyBgCover } from '../utils/layout';

type ParticipantData = { name: string; ready: boolean; isHost: boolean };

export class LobbyScene extends Phaser.Scene {
  private roomId = '';
  private isHost = false;
  private participants: Record<string, ParticipantData> = {};

  // Dynamic UI refs (rebuilt on resize / participant update)
  private participantRows: Phaser.GameObjects.GameObject[] = [];
  private readyBtnTxt!: Phaser.GameObjects.Text;
  private startBtnG: Phaser.GameObjects.Graphics | null = null;
  private startBtnTxt: Phaser.GameObjects.Text | null = null;
  private playerCountTxt!: Phaser.GameObjects.Text;

  // Stable layout ref for parallax tween
  private bg!: Phaser.GameObjects.Image;

  // Debounce handle for resize rebuilds
  private _rebuildTimer: ReturnType<typeof setTimeout> | null = null;

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

    this.buildLayout();
    this.registerSocketEvents();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      if (this._rebuildTimer !== null) { clearTimeout(this._rebuildTimer); this._rebuildTimer = null; }
      this.scale.off('resize', this.onResize, this);
      socket.off('participantsUpdated');
      socket.off('gameStart');
      socket.off('hostLeft');
    });
  }

  private onResize(_size: Phaser.Structs.Size) {
    if (this._rebuildTimer !== null) clearTimeout(this._rebuildTimer);
    this._rebuildTimer = window.setTimeout(() => {
      this._rebuildTimer = null;
      if (!this.scene.isActive()) return;
      this.tweens.killAll();
      this.children.removeAll(true);
      this.participantRows = [];
      this.readyBtnTxt = undefined as unknown as Phaser.GameObjects.Text;
      this.startBtnG = null;
      this.startBtnTxt = null;
      this.buildLayout();
    }, 150);
  }

  // ── FULL LAYOUT ───────────────────────────────────────────────────────────────

  private buildLayout() {
    const { width: w, height: h } = this.scale;
    const layout = getLayout(w, h);

    this.createBackground(w, h, layout);

    if (layout.isPortrait) {
      this.buildPortraitLayout(w, h, layout);
    } else {
      this.buildLandscapeLayout(w, h, layout);
    }
  }

  // ── BACKGROUND ───────────────────────────────────────────────────────────────

  private createBackground(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    this.cameras.main.setBackgroundColor('#050c14');

    const bgKey = layout.bgKey;
    this.bg = this.add.image(w / 2, h / 2, bgKey).setDepth(-20);
    applyBgCover(this.bg, w, h);

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.62).setDepth(-10);

    this.tweens.add({ targets: this.bg, scale: this.bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });

    this.drawFrameCorners(w, h);
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x5ee8ff, 0.28);
    const m = 14, s = 20;
    ([[m, m], [w - m, m], [m, h - m], [w - m, h - m]] as [number, number][]).forEach(([x, y]) => {
      const sx = x === m ? 1 : -1, sy = y === m ? 1 : -1;
      g.lineBetween(x, y, x + sx * s, y);
      g.lineBetween(x, y, x, y + sy * s);
    });
  }

  // ── PORTRAIT LAYOUT ───────────────────────────────────────────────────────────

  private buildPortraitLayout(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    const cx = layout.cx;
    const panelW = Math.min(w * 0.88, 430);

    this.createHeader(cx, h * 0.10, h * 0.18, h * 0.26, panelW, layout);
    this.createParticipantPanel(cx, h * 0.31, panelW, h, layout);
    this.createActionButtons(cx, panelW, h, layout, false);
  }

  // ── LANDSCAPE LAYOUT ──────────────────────────────────────────────────────────

  private buildLandscapeLayout(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    // Left column: code + players list; Right column: action buttons
    const leftCx  = w * 0.35;
    const rightCx = w * 0.72;
    const panelW  = Math.min(w * 0.60, 480);

    this.createHeader(leftCx, h * 0.09, h * 0.17, h * 0.25, panelW, layout);
    this.createParticipantPanel(leftCx, h * 0.30, panelW, h, layout);
    this.createActionButtons(rightCx, Math.min(w * 0.48, 340), h, layout, true);
  }

  // ── HEADER (room code + player count) ────────────────────────────────────────

  private createHeader(
    cx: number,
    labelY: number,
    codeY: number,
    copyY: number,
    _panelW: number,
    layout: ReturnType<typeof getLayout>,
  ) {
    const labelFs = Math.round(layout.fs(16));
    this.add.text(cx, labelY, 'SALA', {
      fontSize: `${labelFs}px`, color: '#4a8a9a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    const codeFs = Math.round(layout.fs(52));
    this.add.text(cx, codeY, this.roomId, {
      fontSize: `${codeFs}px`, color: '#dff8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 10).setDepth(3);

    const copyFs = Math.round(layout.fs(16));
    const copyBtn = this.add.text(cx, copyY, '[ COPIAR CÓDIGO ]', {
      fontSize: `${copyFs}px`, color: '#5ee8ff',
    }).setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true });
    copyBtn.on('pointerdown', () => {
      navigator.clipboard?.writeText(this.roomId).catch(() => {});
      this.showToast('¡Código copiado!');
    });
    copyBtn.on('pointerover', () => copyBtn.setColor('#a0f8ff'));
    copyBtn.on('pointerout',  () => copyBtn.setColor('#5ee8ff'));
  }

  // ── PARTICIPANT PANEL ─────────────────────────────────────────────────────────

  private createParticipantPanel(
    cx: number,
    startY: number,
    panelW: number,
    h: number,
    layout: ReturnType<typeof getLayout>,
  ) {
    // Clear old rows
    this.participantRows.forEach(o => o.destroy());
    this.participantRows = [];

    const count = Object.keys(this.participants).length;
    const countFs = Math.round(layout.fs(16));
    this.playerCountTxt = this.add.text(cx, startY, `JUGADORES (${count}/4)`, {
      fontSize: `${countFs}px`, color: '#3a7a8a',
    }).setOrigin(0.5).setDepth(3);
    this.participantRows.push(this.playerCountTxt);

    const rowH   = Math.max(48, Math.round(h * 0.085));
    const rowGap = Math.max(10, Math.round(h * 0.016));
    const listStartY = startY + countFs + layout.pad * 1.6;
    const myId = getClientIdentity().id;
    const rowInnerW = panelW - 24;
    const rowFs   = Math.round(layout.fs(18));
    const statusFs = Math.round(layout.fs(15));

    Object.entries(this.participants).forEach(([playerId, p], i) => {
      const isMe = playerId === myId;
      const rowY = listStartY + i * (rowH + rowGap);

      const rowBg = this.add.graphics().setDepth(5);
      rowBg.fillStyle(0x030c18, 0.82);
      rowBg.fillRoundedRect(cx - rowInnerW / 2, rowY - rowH / 2, rowInnerW, rowH, 5);
      rowBg.lineStyle(1, isMe ? 0x5ee8ff : 0x1a4458, 0.55);
      rowBg.strokeRoundedRect(cx - rowInnerW / 2, rowY - rowH / 2, rowInnerW, rowH, 5);

      const nameStr = (p.isHost ? '♔ ' : '') + p.name + (isMe ? ' (tú)' : '');
      const nameTxt = this.add.text(cx - rowInnerW / 2 + 14, rowY, nameStr, {
        fontSize: `${rowFs}px`, color: isMe ? '#c8f8ff' : '#7aadc0',
      }).setOrigin(0, 0.5).setDepth(6);

      const statusTxt = this.add.text(cx + rowInnerW / 2 - 14, rowY, p.ready ? '✓ LISTO' : '...', {
        fontSize: `${statusFs}px`, color: p.ready ? '#5ff5aa' : '#2e5a6e',
      }).setOrigin(1, 0.5).setDepth(6);

      this.participantRows.push(rowBg, nameTxt, statusTxt);
    });
  }

  // ── ACTION BUTTONS ────────────────────────────────────────────────────────────

  private createActionButtons(
    cx: number,
    btnW: number,
    h: number,
    layout: ReturnType<typeof getLayout>,
    landscape: boolean,
  ) {
    const btnH   = Math.max(56, Math.round(layout.fs(20) * 2.4));
    const btnFs  = Math.round(layout.fs(18));
    const backH  = Math.max(44, Math.round(layout.fs(16) * 2));
    const backFs = Math.round(layout.fs(15));

    // Positions depend on layout mode
    const readyY = landscape ? h * 0.35 : (this.isHost ? h * 0.69 : h * 0.76);
    const startY = landscape ? h * 0.52 : h * 0.80;
    const backY  = landscape ? h * 0.70 : (this.isHost ? h * 0.90 : h * 0.88);

    // ── LISTO button ───────────────────────────────────────────────────────────
    const readyG = this.add.graphics().setDepth(8);
    const drawReady = (hover: boolean) => {
      readyG.clear();
      readyG.fillStyle(hover ? 0x145f78 : 0x0d4d62, 0.97);
      readyG.fillRoundedRect(cx - btnW / 2, readyY - btnH / 2, btnW, btnH, 8);
      readyG.lineStyle(2, 0x5ee8ff, 0.90);
      readyG.strokeRoundedRect(cx - btnW / 2, readyY - btnH / 2, btnW, btnH, 8);
    };
    drawReady(false);
    const readyTxt = this.add.text(cx, readyY, 'LISTO', {
      fontSize: `${btnFs}px`, color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    const readyHit = this.add.rectangle(cx, readyY, btnW, btnH).setDepth(10).setInteractive({ useHandCursor: true });
    readyHit.on('pointerover', () => drawReady(true));
    readyHit.on('pointerout',  () => drawReady(false));
    readyHit.on('pointerdown', () => {
      this.tweens.add({ targets: [readyG, readyTxt], alpha: 0.6, yoyo: true, duration: 80 });
      socket.emit('toggleReady', { roomId: this.roomId, playerId: getClientIdentity().id });
    });
    this.readyBtnTxt = readyTxt;

    // ── INICIAR button (host only) ─────────────────────────────────────────────
    if (this.isHost) {
      const startG = this.add.graphics().setDepth(8);
      const drawStart = (hover: boolean, enabled: boolean) => {
        startG.clear();
        startG.fillStyle(enabled ? (hover ? 0x145f78 : 0x0d4d62) : 0x0a1a24, 0.97);
        startG.fillRoundedRect(cx - btnW / 2, startY - btnH / 2, btnW, btnH, 8);
        startG.lineStyle(1.5, enabled ? 0x5ee8ff : 0x3a7a8a, enabled ? 0.9 : 0.45);
        startG.strokeRoundedRect(cx - btnW / 2, startY - btnH / 2, btnW, btnH, 8);
      };
      drawStart(false, false);
      const startTxt = this.add.text(cx, startY, 'INICIAR PARTIDA', {
        fontSize: `${btnFs}px`, color: '#3a7a8a', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(9);
      const startHit = this.add.rectangle(cx, startY, btnW, btnH).setDepth(10).setInteractive({ useHandCursor: true });
      startHit.on('pointerover', () => drawStart(true, this.canStart()));
      startHit.on('pointerout',  () => drawStart(false, this.canStart()));
      startHit.on('pointerdown', () => {
        if (!this.canStart()) return;
        this.tweens.add({ targets: [startG, startTxt], alpha: 0.6, yoyo: true, duration: 80 });
        socket.emit('startGame', { roomId: this.roomId });
      });
      this.startBtnG   = startG;
      this.startBtnTxt = startTxt;
    }

    // ── SALIR button ───────────────────────────────────────────────────────────
    const backW = Math.min(btnW * 0.70, 260);
    const backG = this.add.graphics().setDepth(8);
    const drawBack = (hover: boolean) => {
      backG.clear();
      backG.fillStyle(hover ? 0x0a1d2c : 0x050e1a, 0.90);
      backG.fillRoundedRect(cx - backW / 2, backY - backH / 2, backW, backH, 7);
      backG.lineStyle(1, 0x5ee8ff, 0.35);
      backG.strokeRoundedRect(cx - backW / 2, backY - backH / 2, backW, backH, 7);
    };
    drawBack(false);
    const backTxt = this.add.text(cx, backY, '← SALIR DE SALA', {
      fontSize: `${backFs}px`, color: '#6ab8cc',
    }).setOrigin(0.5).setDepth(9);
    const backHit = this.add.rectangle(cx, backY, backW, backH).setDepth(10).setInteractive({ useHandCursor: true });
    backHit.on('pointerover', () => drawBack(true));
    backHit.on('pointerout',  () => drawBack(false));
    backHit.on('pointerdown', () => {
      this.tweens.add({ targets: [backG, backTxt], alpha: 0.6, yoyo: true, duration: 80 });
      socket.emit('leaveRoom', { roomId: this.roomId, playerId: getClientIdentity().id });
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
    });

    this.updateButtonStates();
  }

  // ── BUTTON STATES ─────────────────────────────────────────────────────────────

  private canStart(): boolean {
    const parts = Object.values(this.participants);
    return parts.length >= 1 && parts.every(p => p.ready);
  }

  private updateButtonStates() {
    const myId = getClientIdentity().id;
    const isReady = this.participants[myId]?.ready ?? false;
    if (this.readyBtnTxt) this.readyBtnTxt.setText(isReady ? 'CANCELAR LISTO' : 'LISTO');

    if (this.startBtnG && this.startBtnTxt) {
      const enabled = this.canStart();
      const { width: w, height: h } = this.scale;
      const layout   = getLayout(w, h);
      const landscape = layout.isLandscape;
      // Match exactly the same formula used in buildLandscapeLayout / buildPortraitLayout
      const btnW  = landscape ? Math.min(w * 0.48, 340) : Math.min(w * 0.88, 430);
      const btnH  = Math.max(40, Math.round(layout.fs(16) * 2.4));
      const startY = landscape ? h * 0.52 : h * 0.80;
      const cx     = landscape ? w * 0.72 : layout.cx;
      this.startBtnG.clear();
      this.startBtnG.fillStyle(enabled ? 0x0d4d62 : 0x0a1a24, 0.97);
      this.startBtnG.fillRoundedRect(cx - btnW / 2, startY - btnH / 2, btnW, btnH, 8);
      this.startBtnG.lineStyle(1.5, enabled ? 0x5ee8ff : 0x3a7a8a, enabled ? 0.9 : 0.45);
      this.startBtnG.strokeRoundedRect(cx - btnW / 2, startY - btnH / 2, btnW, btnH, 8);
      this.startBtnTxt.setColor(enabled ? '#d4fbff' : '#3a7a8a');
    }
  }

  // ── SOCKET EVENTS ─────────────────────────────────────────────────────────────

  private registerSocketEvents() {
    socket.off('participantsUpdated');
    socket.off('gameStart');
    socket.off('hostLeft');

    socket.on('participantsUpdated', (data: { participants: Record<string, ParticipantData> }) => {
      this.participants = data.participants;
      // Partial update: just re-render rows and update button states
      const { width: w, height: h } = this.scale;
      const layout = getLayout(w, h);
      const landscape = !layout.isPortrait;
      const panelW = Math.min(landscape ? w * 0.60 : w * 0.88, landscape ? 480 : 430);
      const cx = landscape ? w * 0.35 : layout.cx;
      const startY = landscape ? h * 0.30 : h * 0.31;
      this.createParticipantPanel(cx, startY, panelW, h, layout);
      this.updateButtonStates();

      // Update player count in header (re-create text is easiest since header is static)
      const count = Object.keys(this.participants).length;
      if (this.playerCountTxt?.active) this.playerCountTxt.setText(`JUGADORES (${count}/4)`);
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
  }

  // ── TOAST ─────────────────────────────────────────────────────────────────────

  private showToast(message: string) {
    const { width: w, height: h } = this.scale;
    const layout = getLayout(w, h);
    const t = this.add.text(layout.cx, h * 0.95, message, {
      fontSize: `${Math.round(layout.fs(13))}px`,
      color: '#dff8ff',
      backgroundColor: 'rgba(1,8,16,0.88)',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 12, duration: 2200, onComplete: () => t.destroy() });
  }
}
