import Phaser from 'phaser';
import { applyBgCover, getLayout } from '../utils/layout';

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Rectangle;

  private barWidth = 0;
  private barHeight = 0;
  private barX = 0;
  private barY = 0;
  private currentProgress = 0;

  constructor() { super('LoadingScene'); }

  preload() {
    const { width, height } = this.scale;
    const layout = getLayout(width, height);

    this.cameras.main.setBackgroundColor('#050c14');

    // loading-bg is preloaded in BootScene (orientation-aware random variant)
    this.bg = this.add.image(layout.cx, layout.cy, 'loading-bg').setDepth(-20);
    applyBgCover(this.bg, width, height);

    // Dark overlay
    this.overlay = this.add
      .rectangle(layout.cx, layout.cy, width, height, 0x000000, 0.45)
      .setDepth(-10);

    // Slow parallax zoom
    this.tweens.add({
      targets: this.bg,
      scale: this.bg.scale * 1.05,
      duration: 10000,
      yoyo: true,
      repeat: -1,
    });

    this.createLoadingBar(width, height, layout.fs);

    this.load.on('progress', (v: number) => {
      this.currentProgress = v;
      this.updateProgressBar(v);
    });
    this.load.on('complete', () => {
      this.updateProgressBar(1);
      this.time.delayedCall(500, () => this.scene.start('MainMenuScene'));
    });

    // ── Game / menu assets ─────────────────────────────────────────────────────
    this.load.image('bg-desktop', '/assets/background/BG_Desktop.png');
    this.load.image('bg-mobile',  '/assets/background/BG_Mobile.png');
    this.load.image('btn-create', '/assets/main-menu/button_create.png');
    this.load.image('btn-join',   '/assets/main-menu/button-join.png');
    this.load.image('avatar-ring','/assets/main-menu/avatar_ring.png');
    // logo is already loaded in BootScene as 'logo'

    // ── Man character sprites (frame size: 1254×1254) ─────────────────────────
    // Spritesheets
    this.load.spritesheet('man-attack', '/assets/characters/man/attack.webp', {
      frameWidth: 1254, frameHeight: 1254,  // 7 frames → 8778×1254
    });
    this.load.spritesheet('man-jump', '/assets/characters/man/jump.webp', {
      frameWidth: 1254, frameHeight: 1254,  // 11 frames → 13794×1254
    });
    // Single-frame images
    this.load.image('man-idle',  '/assets/characters/man/idle.png');
    this.load.image('man-run',   '/assets/characters/man/run.png');
    this.load.image('man-fall',  '/assets/characters/man/fall.png');
    this.load.image('man-hurt',  '/assets/characters/man/hurt.png');
    this.load.image('man-death', '/assets/characters/man/death.png');
    this.load.image('man-parry', '/assets/characters/man/parry.png');

    // Resize listener
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
  }

  // ── Bar creation ─────────────────────────────────────────────────────────────

  private createLoadingBar(
    w: number,
    h: number,
    fs: (base: number) => number,
  ) {
    const cx = w / 2;
    this.barHeight = Math.max(14, Math.round(h * 0.022));
    this.barWidth  = Math.min(w * 0.72, 520);
    this.barX      = (w - this.barWidth) / 2;
    this.barY      = h * 0.84;

    this.progressGlow = this.add.graphics().setDepth(8);
    this.progressBox  = this.add.graphics().setDepth(9);
    this.progressBar  = this.add.graphics().setDepth(10);

    // Box border
    this.progressBox.lineStyle(1, 0x5ee8ff, 0.7);
    this.progressBox.strokeRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);
    this.progressBox.fillStyle(0x020811, 0.80);
    this.progressBox.fillRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);

    const labelFs = Math.round(fs(16));
    const pctFs   = Math.round(fs(13));

    this.loadingText = this.add.text(cx, this.barY - Math.round(h * 0.042), 'CARGANDO...', {
      fontSize: `${labelFs}px`, color: '#dff8ff', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0.5).setDepth(11);

    this.percentText = this.add.text(cx, this.barY + this.barHeight + Math.round(h * 0.028), '0%', {
      fontSize: `${pctFs}px`, color: '#8eefff',
    }).setOrigin(0.5).setDepth(11);

    this.updateProgressBar(0);
  }

  private updateProgressBar(value: number) {
    const safe = Phaser.Math.Clamp(value, 0, 1);
    this.progressBar.clear();
    this.progressGlow.clear();

    const fillW = Math.max((this.barWidth - 8) * safe, 4);

    // Glow behind bar
    this.progressGlow
      .setBlendMode(Phaser.BlendModes.ADD)
      .fillStyle(0x5ee8ff, 0.10)
      .fillRoundedRect(this.barX - 6, this.barY - 6, fillW + 14, this.barHeight + 12, 8);

    // Fill
    this.progressBar
      .fillStyle(0x1aaec2, 1)
      .fillRoundedRect(this.barX + 4, this.barY + 3, fillW, this.barHeight - 6, 4);

    this.percentText?.setText(`${Math.round(safe * 100)}%`);
  }

  // ── Resize ───────────────────────────────────────────────────────────────────

  private onResize(gameSize: Phaser.Structs.Size) {
    const { width: w, height: h } = gameSize;
    const layout = getLayout(w, h);

    applyBgCover(this.bg, w, h);
    this.overlay.setSize(w, h).setPosition(layout.cx, layout.cy);

    // Recompute bar geometry
    this.barHeight = Math.max(14, Math.round(h * 0.022));
    this.barWidth  = Math.min(w * 0.72, 520);
    this.barX      = (w - this.barWidth) / 2;
    this.barY      = h * 0.84;

    // Redraw box
    this.progressBox.clear();
    this.progressBox.lineStyle(1, 0x5ee8ff, 0.7);
    this.progressBox.strokeRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);
    this.progressBox.fillStyle(0x020811, 0.80);
    this.progressBox.fillRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);

    const labelFs = Math.round(layout.fs(16));
    const pctFs   = Math.round(layout.fs(13));

    this.loadingText
      .setPosition(layout.cx, this.barY - Math.round(h * 0.042))
      .setFontSize(`${labelFs}px`);
    this.percentText
      .setPosition(layout.cx, this.barY + this.barHeight + Math.round(h * 0.028))
      .setFontSize(`${pctFs}px`);

    this.updateProgressBar(this.currentProgress);
  }
}
