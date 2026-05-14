import Phaser from 'phaser';

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Rectangle;
  
  private barWidth = 0;
  private barHeight = 20;
  private barX = 0;
  private barY = 0;

  constructor() { super('LoadingScene'); }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // --- Background Handling (Cover Scale) ---
    this.bg = this.add.image(cx, cy, 'loading-background').setDepth(-20);
    this.applyBackgroundScaling();

    // Dark overlay for readability
    this.overlay = this.add.rectangle(cx, cy, width, height, 0x000000, 0.4).setDepth(-10);

    // Subtle zoom animation
    this.tweens.add({
      targets: this.bg,
      scale: this.bg.scale * 1.05,
      duration: 10000,
      yoyo: true,
      repeat: -1
    });

    this.createLoadingBar(width, height);

    // Asset Loading
    this.load.on('progress', (v: number) => this.updateProgressBar(v));
    this.load.on('complete', () => {
      this.updateProgressBar(1);
      this.time.delayedCall(500, () => this.scene.start('MainMenuScene'));
    });

    // Load remaining assets
    this.load.image('bg-desktop', '/assets/background/BG_Desktop.png');
    this.load.image('bg-mobile',  '/assets/main-menu/background-mobile.png');
    this.load.image('btn-create', '/assets/main-menu/button_create.png');
    this.load.image('btn-join',   '/assets/main-menu/button-join.png');
    this.load.image('avatar-ring','/assets/main-menu/avatar_ring.png');
    this.load.image('logo', '/assets/logo/logo.png');
    this.load.image('avatars', '/assets/avatars/avatars.png');
    
    // Listen for resize events to reposition elements
    this.scale.on('resize', this.handleResize, this);
  }

  private applyBackgroundScaling() {
    const { width, height } = this.scale;
    // Calculate scale to "Cover" the screen without distortion
    const scaleX = width / this.bg.width;
    const scaleY = height / this.bg.height;
    const scale = Math.max(scaleX, scaleY);
    this.bg.setScale(scale).setPosition(width / 2, height / 2);
    
    if (this.overlay) {
        this.overlay.setSize(width, height).setPosition(width / 2, height / 2);
    }
  }

  private createLoadingBar(width: number, height: number) {
    this.barWidth = Math.min(width * 0.7, 500);
    this.barX = (width - this.barWidth) / 2;
    this.barY = height * 0.85; // Positioned towards the bottom

    this.progressGlow = this.add.graphics().setDepth(8);
    this.progressBox = this.add.graphics().setDepth(9);
    this.progressBar = this.add.graphics().setDepth(10);

    this.loadingText = this.add.text(width / 2, this.barY - 30, 'CARGANDO...', {
      fontSize: '18px', 
      color: '#ffffff',
      fontStyle: 'bold',
      letterSpacing: 2
    }).setOrigin(0.5).setDepth(11);

    this.percentText = this.add.text(width / 2, this.barY + 40, '0%', {
      fontSize: '16px', color: '#8eefff',
    }).setOrigin(0.5).setDepth(11);

    this.updateProgressBar(0);
  }

  private updateProgressBar(value: number) {
    const safe = Phaser.Math.Clamp(value, 0, 1);
    this.progressBar.clear();
    this.progressBox.clear();
    this.progressGlow.clear();

    // Background of the bar
    this.progressBox.fillStyle(0x222222, 0.8);
    this.progressBox.fillRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);
    
    // The actual progress
    const fillWidth = (this.barWidth - 10) * safe;
    if (fillWidth > 0) {
        this.progressBar.fillStyle(0x00ffff, 1);
        this.progressBar.fillRoundedRect(this.barX + 5, this.barY + 5, fillWidth, this.barHeight - 10, 3);
        
        // Glow effect
        this.progressGlow.lineStyle(2, 0x00ffff, 0.5);
        this.progressGlow.strokeRoundedRect(this.barX, this.barY, this.barWidth, this.barHeight, 5);
    }

    this.percentText.setText(`${Math.round(safe * 100)}%`);
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;
    this.applyBackgroundScaling();
    
    // Update Bar Positions
    this.barWidth = Math.min(width * 0.7, 500);
    this.barX = (width - this.barWidth) / 2;
    this.barY = height * 0.85;
    
    this.loadingText.setPosition(width / 2, this.barY - 30);
    this.percentText.setPosition(width / 2, this.barY + 40);
    
    // Redraw bar with current progress
    this.updateProgressBar(this.load.progress);
  }
}
