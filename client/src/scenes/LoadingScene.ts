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
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(width / 2, height / 2, 'loading-background').setScale(Math.max(width / 1600, height / 900)).setDepth(-20);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.58).setDepth(-10);
    this.add.rectangle(width / 2, height * 0.2, width * 0.84, 120, 0x020811, 0.45).setStrokeStyle(1, 0x5ee8ff, 0.6).setDepth(2);
    this.add.text(width / 2, height * 0.18, 'ARENA BRAWLER', { fontSize: `${Math.max(30, Math.round(width * 0.08))}px`, color: '#98f5ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3).setShadow(0, 0, '#2dd7e6', 14);
    this.add.text(width / 2, height * 0.23, '2D', { fontSize: `${Math.max(20, Math.round(width * 0.05))}px`, color: '#d9fdff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);
    this.tweens.add({ targets: bg, scale: bg.scale * 1.03, duration: 9000, yoyo: true, repeat: -1 });

    this.add.particles(0, 0, 'loading-particle', { x: { min: 0, max: width }, y: { min: height * 0.35, max: height + 40 }, lifespan: { min: 2600, max: 6200 }, speedY: { min: -18, max: -48 }, scale: { start: 0.65, end: 0 }, alpha: { start: 0.45, end: 0 }, frequency: 140, blendMode: 'ADD' }).setDepth(4);

    this.createLoadingBar(width, height);

    this.load.on('progress', (v: number) => this.updateProgressBar(v));
    this.load.on('complete', () => { this.updateProgressBar(1); this.time.delayedCall(650, () => this.scene.start('MainMenuScene')); });
    this.load.image('loading-background-cache-test', '/assets/ui/loading/loading-background.png');
  }

  private createLoadingBar(width: number, height: number) {
    this.barWidth = Math.min(width * 0.68, 420); this.barHeight = 18; this.barX = (width - this.barWidth) / 2; this.barY = height * 0.74;
    this.progressGlow = this.add.graphics().setDepth(8); this.progressBox = this.add.graphics().setDepth(9); this.progressBar = this.add.graphics().setDepth(10);
    this.progressBox.fillStyle(0x020811, 0.84).fillRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 9);
    this.progressBox.lineStyle(1, 0x5ee8ff, 0.9).strokeRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 9);
    this.add.text(width / 2, this.barY - 34, 'Cargando arena...', { fontSize: '16px', color: '#dff8ff' }).setOrigin(0.5).setDepth(11);
    this.percentText = this.add.text(width / 2, this.barY + 34, '0%', { fontSize: '14px', color: '#8eefff' }).setOrigin(0.5).setDepth(11);
    this.updateProgressBar(0);
  }

  private updateProgressBar(value: number) {
    const safe = Phaser.Math.Clamp(value, 0, 1); const fillW = Math.max((this.barWidth - 8) * safe, 4);
    this.progressBar.clear(); this.progressGlow.clear();
    this.progressGlow.fillStyle(0x5ee8ff, 0.15).fillRoundedRect(this.barX - 8, this.barY - 8, fillW + 18, this.barHeight + 16, 12);
    this.progressBar.fillStyle(0x1aaec2, 1).fillRoundedRect(this.barX + 4, this.barY + 4, fillW, this.barHeight - 8, 6);
    this.progressBar.lineStyle(1, 0xdff8ff, 0.8).strokeRoundedRect(this.barX + 4, this.barY + 4, fillW, this.barHeight - 8, 6);
    this.percentText.setText(`${Math.round(safe * 100)}%`);
  }
}
