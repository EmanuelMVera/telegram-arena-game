import Phaser from 'phaser';
import { getClientIdentity } from '../telegram/telegram';
import { getLayout, applyBgCover } from '../utils/layout';

type RankEntry = { id: string; name: string; kills: number; deaths: number };

export class ResultsScene extends Phaser.Scene {
  constructor() { super('ResultsScene'); }

  create() {
    const data = this.scene.settings.data as { ranking?: RankEntry[] } | null;
    const ranking = data?.ranking ?? [];
    const { width: w, height: h } = this.scale;
    const layout = getLayout(w, h);
    const myId = getClientIdentity().id;

    this.createBackground(w, h);
    this.createHeader(w, h, ranking, layout);
    this.createRankingTable(w, h, ranking, myId, layout);
    this.createButtons(w, h, layout);
  }

  private createBackground(w: number, h: number) {
    this.cameras.main.setBackgroundColor('#050c14');
    const { bgKey } = getLayout(w, h);
    const bg = this.add.image(w / 2, h / 2, bgKey).setDepth(-20);
    applyBgCover(bg, w, h);
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72).setDepth(-10);
    this.tweens.add({ targets: bg, scale: bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });
    this.drawFrameCorners(w, h);
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x5ee8ff, 0.28);
    const m = 14, s = 20;
    g.lineBetween(m, m, m + s, m);          g.lineBetween(m, m, m, m + s);
    g.lineBetween(w - m, m, w - m - s, m);  g.lineBetween(w - m, m, w - m, m + s);
    g.lineBetween(m, h - m, m + s, h - m);  g.lineBetween(m, h - m, m, h - m - s);
    g.lineBetween(w - m, h - m, w - m - s, h - m); g.lineBetween(w - m, h - m, w - m, h - m - s);
  }

  private createHeader(
    w: number,
    h: number,
    ranking: RankEntry[],
    layout: ReturnType<typeof getLayout>,
  ) {
    const cx = layout.cx;

    this.add.text(cx, h * 0.065, 'FIN DE PARTIDA', {
      fontSize: `${Math.round(layout.fs(11))}px`, color: '#4a8a9a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    this.add.text(cx, h * 0.12, 'RESULTADOS', {
      fontSize: `${Math.round(layout.fs(32))}px`, color: '#dff8ff', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 14).setDepth(3);

    if (ranking.length > 0) {
      this.add.text(cx, h * 0.20, `GANADOR: ${ranking[0].name}`, {
        fontSize: `${Math.round(layout.fs(13))}px`, color: '#5ee8b0', fontStyle: 'bold',
        backgroundColor: 'rgba(0,40,20,0.6)', padding: { x: 12, y: 4 },
      }).setOrigin(0.5).setDepth(3);
    }

    const g = this.add.graphics().setDepth(2);
    const sepW = Math.min(w * 0.55, 260);
    g.lineStyle(1, 0x5ee8ff, 0.35);
    g.lineBetween(cx - sepW / 2, h * 0.255, cx + sepW / 2, h * 0.255);
  }

  private createRankingTable(
    w: number,
    h: number,
    ranking: RankEntry[],
    myId: string,
    layout: ReturnType<typeof getLayout>,
  ) {
    const cx = layout.cx;
    const panelW = Math.min(w * 0.88, 480);
    const startY = h * 0.285;
    const rowH   = Math.max(40, Math.round(h * 0.08));
    const rowGap = Math.max(5, Math.round(h * 0.01));

    const posColors = ['#d4a017', '#a0a0a0', '#b87333', '#4a7a8a'];

    ranking.forEach((entry, i) => {
      const isMe = entry.id === myId;
      const isWinner = i === 0;
      const rowY = startY + i * (rowH + rowGap) + rowH / 2;

      const fillColor = isWinner ? 0x0a2e14 : (isMe ? 0x081828 : 0x030c18);
      const borderColor = isWinner ? 0x5ee8b0 : (isMe ? 0x5ee8ff : 0x1a4458);
      this.add.rectangle(cx, rowY, panelW - 16, rowH, fillColor, 0.92)
        .setStrokeStyle(1, borderColor, (isWinner || isMe) ? 0.85 : 0.4).setDepth(4);

      const posFs  = Math.round(layout.fs(14));
      const nameFs = Math.round(layout.fs(13));
      const statFs = Math.round(layout.fs(15));
      const lblFs  = Math.round(layout.fs(10));

      this.add.text(cx - panelW / 2 + 22, rowY, `#${i + 1}`, {
        fontSize: `${posFs}px`, color: posColors[i] ?? '#3a6070', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(5);

      const nameColor = isWinner ? '#8effcc' : (isMe ? '#c8f8ff' : '#7aadc0');
      const displayName = entry.name + (isMe ? ' (tú)' : '');
      this.add.text(cx - panelW / 2 + 50, rowY, displayName, {
        fontSize: `${nameFs}px`, color: nameColor, fontStyle: isWinner ? 'bold' : 'normal',
      }).setOrigin(0, 0.5).setDepth(5);

      const statGap = Math.min(panelW * 0.19, 76);
      this.add.text(cx + panelW / 2 - statGap * 2, rowY - 5, `${entry.kills}`, {
        fontSize: `${statFs}px`, color: '#5ee8ff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(5);
      this.add.text(cx + panelW / 2 - statGap * 2, rowY + 9, 'kills', {
        fontSize: `${lblFs}px`, color: '#2a6070',
      }).setOrigin(0.5, 0).setDepth(5);

      this.add.text(cx + panelW / 2 - statGap * 0.7, rowY - 5, `${entry.deaths}`, {
        fontSize: `${statFs}px`, color: '#aa6060',
      }).setOrigin(0.5).setDepth(5);
      this.add.text(cx + panelW / 2 - statGap * 0.7, rowY + 9, 'muertes', {
        fontSize: `${lblFs}px`, color: '#2a4050',
      }).setOrigin(0.5, 0).setDepth(5);
    });

    if (ranking.length === 0) {
      this.add.text(layout.cx, h * 0.5, 'Sin resultados disponibles', {
        fontSize: `${Math.round(layout.fs(13))}px`, color: '#3a7a8a',
      }).setOrigin(0.5).setDepth(5);
    }
  }

  private createButtons(w: number, h: number, layout: ReturnType<typeof getLayout>) {
    const cx = layout.cx;
    const btnW = Math.min(w * 0.78, 380);
    const btnH = Math.max(38, Math.round(layout.fs(15) * 2.4));
    const btn1Y = h * 0.80;
    const btn2Y = h * 0.88;

    const newBg = this.add.rectangle(cx, btn1Y, btnW, btnH, 0x0d4d62, 0.97)
      .setStrokeStyle(2, 0x5ee8ff, 0.9).setDepth(8).setInteractive({ useHandCursor: true });
    const newTxt = this.add.text(cx, btn1Y, 'NUEVA PARTIDA', {
      fontSize: `${Math.round(layout.fs(15))}px`, color: '#d4fbff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    newBg.on('pointerover', () => newBg.setFillStyle(0x145f78, 0.97));
    newBg.on('pointerout',  () => newBg.setFillStyle(0x0d4d62, 0.97));
    newBg.on('pointerdown', () => {
      this.tweens.add({ targets: [newBg, newTxt], alpha: 0.6, yoyo: true, duration: 80 });
      this.cameras.main.fadeOut(320, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('MainMenuScene'),
      );
    });

    const menuBg = this.add.rectangle(cx, btn2Y, btnW, btnH, 0x050e1a, 0.9)
      .setStrokeStyle(1, 0x5ee8ff, 0.35).setDepth(8).setInteractive({ useHandCursor: true });
    const menuTxt = this.add.text(cx, btn2Y, 'MENU PRINCIPAL', {
      fontSize: `${Math.round(layout.fs(14))}px`, color: '#6ab8cc',
    }).setOrigin(0.5).setDepth(9);
    menuBg.on('pointerover', () => menuBg.setFillStyle(0x0a1d2c, 0.9));
    menuBg.on('pointerout',  () => menuBg.setFillStyle(0x050e1a, 0.9));
    menuBg.on('pointerdown', () => {
      this.tweens.add({ targets: [menuBg, menuTxt], alpha: 0.6, yoyo: true, duration: 80 });
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenuScene'));
    });
  }
}
