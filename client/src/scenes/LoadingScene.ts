import Phaser from 'phaser';

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private barX = 0; private barY = 0; private barWidth = 0; private barHeight = 0;

  constructor() { super('LoadingScene'); }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(cx, height / 2, 'loading-background')
      .setScale(Math.max(width / 1600, height / 900)).setDepth(-20);
    this.add.rectangle(cx, height / 2, width, height, 0x000000, 0.6).setDepth(-10);
    this.tweens.add({ targets: bg, scale: bg.scale * 1.03, duration: 9000, yoyo: true, repeat: -1 });

    this.drawFrameCorners(width, height);

    // Title panel
    const titlePanelY = height * 0.22;
    this.add.rectangle(cx, titlePanelY, Math.min(width * 0.84, 500), Math.round(height * 0.24), 0x020811, 0.48)
      .setStrokeStyle(1, 0x5ee8ff, 0.55).setDepth(2);

    // Diamond ornament above panel
    const ornY = titlePanelY - height * 0.13;
    this.drawDiamond(cx, ornY, 8, 0x5ee8ff, 0.85).setDepth(3);
    const oG = this.add.graphics().setDepth(3);
    oG.lineStyle(1, 0x5ee8ff, 0.4);
    oG.lineBetween(cx - 70, ornY, cx - 18, ornY);
    oG.lineBetween(cx + 18, ornY, cx + 70, ornY);

    const titleFs = Math.max(28, Math.round(Math.min(width * 0.085, height * 0.068)));
    this.add.text(cx, height * 0.18, 'ARENA BRAWLER', {
      fontSize: `${titleFs}px`, color: '#98f5ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3).setShadow(0, 0, '#2dd7e6', 14);

    const subtitleFs = Math.max(18, Math.round(titleFs * 0.58));
    this.add.text(cx, height * 0.245, '2D', {
      fontSize: `${subtitleFs}px`, color: '#d9fdff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    // Thin separator below subtitle
    const sepG = this.add.graphics().setDepth(3);
    const sepW = Math.min(width * 0.4, 200);
    sepG.lineStyle(1, 0x5ee8ff, 0.4);
    sepG.lineBetween(cx - sepW / 2, height * 0.29, cx + sepW / 2, height * 0.29);
    this.drawDiamond(cx, height * 0.29, 4, 0x5ee8ff, 0.7).setDepth(3);

    // Particles — wider spawn area to fill the middle section
    this.add.particles(0, 0, 'loading-particle', {
      x: { min: width * 0.05, max: width * 0.95 },
      y: { min: height * 0.3, max: height + 20 },
      lifespan: { min: 3000, max: 6500 },
      speedY: { min: -22, max: -52 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.42, end: 0 },
      frequency: 110,
      blendMode: 'ADD',
    }).setDepth(4);

    this.createLoadingBar(width, height);

    this.load.on('progress', (v: number) => this.updateProgressBar(v));
    this.load.on('complete', () => {
      this.updateProgressBar(1);
      this.time.delayedCall(650, () => this.scene.start('MainMenuScene'));
    });

    // Main-menu assets
    this.load.image('bg-desktop', '/assets/main-menu/background-desktop.png');
    this.load.image('bg-mobile',  '/assets/main-menu/background-mobile.png');
    this.load.image('btn-create', '/assets/main-menu/button_create.png');
    this.load.image('btn-join',   '/assets/main-menu/botton-join.png');
    this.load.image('avatar-ring','/assets/main-menu/avatar_ring.png');
  }

  private drawFrameCorners(w: number, h: number) {
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x5ee8ff, 0.25);
    const m = 14;
    const s = 20;
    g.lineBetween(m, m, m + s, m);        g.lineBetween(m, m, m, m + s);
    g.lineBetween(w - m, m, w - m - s, m); g.lineBetween(w - m, m, w - m, m + s);
    g.lineBetween(m, h - m, m + s, h - m); g.lineBetween(m, h - m, m, h - m - s);
    g.lineBetween(w - m, h - m, w - m - s, h - m); g.lineBetween(w - m, h - m, w - m, h - m - s);
  }

  private drawDiamond(x: number, y: number, size: number, color: number, alpha: number = 1) {
    const g = this.add.graphics();
    g.fillStyle(color, alpha);
    g.fillTriangle(x, y - size, x + size * 0.65, y, x - size * 0.65, y);
    g.fillTriangle(x, y + size, x + size * 0.65, y, x - size * 0.65, y);
    return g;
  }

  private createLoadingBar(width: number, height: number) {
    this.barWidth = Math.min(width * 0.68, 420);
    this.barHeight = 18;
    this.barX = (width - this.barWidth) / 2;
    this.barY = height * 0.74;

    this.progressGlow = this.add.graphics().setDepth(8);
    this.progressBox = this.add.graphics().setDepth(9);
    this.progressBar = this.add.graphics().setDepth(10);

    this.progressBox.fillStyle(0x020811, 0.84)
      .fillRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 9);
    this.progressBox.lineStyle(1, 0x5ee8ff, 0.9)
      .strokeRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 9);

    this.add.text(width / 2, this.barY - 34, 'Cargando arena...', {
      fontSize: '16px', color: '#dff8ff',
    }).setOrigin(0.5).setDepth(11);

    this.percentText = this.add.text(width / 2, this.barY + 34, '0%', {
      fontSize: '14px', color: '#8eefff',
    }).setOrigin(0.5).setDepth(11);

    this.updateProgressBar(0);
  }

  private updateProgressBar(value: number) {
    const safe = Phaser.Math.Clamp(value, 0, 1);
    const fillW = Math.max((this.barWidth - 8) * safe, 4);
    this.progressBar.clear();
    this.progressGlow.clear();
    this.progressGlow.fillStyle(0x5ee8ff, 0.12)
      .fillRoundedRect(this.barX - 8, this.barY - 8, fillW + 18, this.barHeight + 16, 12);
    this.progressBar.fillStyle(0x1aaec2, 1)
      .fillRoundedRect(this.barX + 4, this.barY + 4, fillW, this.barHeight - 8, 6);
    this.progressBar.lineStyle(1, 0xdff8ff, 0.8)
      .strokeRoundedRect(this.barX + 4, this.barY + 4, fillW, this.barHeight - 8, 6);
    this.percentText.setText(`${Math.round(safe * 100)}%`);
  }
}
