import Phaser from "phaser";

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;

  private barX = 0;
  private barY = 0;
  private barWidth = 0;
  private barHeight = 0;

  constructor() {
    super("LoadingScene");
  }

  preload() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#07111d");

    this.createBackground(width, height);
    this.createLogo(width, height);
    this.createParticles(width, height);
    this.createLoadingBar(width, height);
    this.createLoadingText(width);

    this.load.on("progress", (value: number) => {
      this.updateProgressBar(value);
    });

    this.load.on("complete", () => {
      this.updateProgressBar(1);

      this.time.delayedCall(700, () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
      });

      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("MainMenuScene");
      });
    });

    /*
      Assets futuros del juego.

      Acá después vamos a cargar:
      - sprites de personajes
      - mapas
      - efectos
      - sonidos
      - iconos

      Por ahora agregamos una carga mínima simulada para que la barra se vea.
    */

    this.load.image(
      "loading-background-cache-test",
      "/assets/ui/loading/loading-background.png",
    );
  }

  private createBackground(width: number, height: number) {
    const background = this.add.image(
      width / 2,
      height / 2,
      "loading-background",
    );

    this.coverImage(background, width, height);
    background.setDepth(-20);

    const darkOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.25,
    );

    darkOverlay.setDepth(-10);

    this.tweens.add({
      targets: background,
      scale: background.scale + 0.035,
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private createLogo(width: number, height: number) {
    const logo = this.add.image(width / 2, height * 0.2, "arena-brawler-logo");

    const logoMaxWidth = width * 0.82;
    const logoMaxHeight = height * 0.22;

    const logoScale = Math.min(
      logoMaxWidth / logo.width,
      logoMaxHeight / logo.height,
      1,
    );

    logo.setScale(logoScale);
    logo.setAlpha(0);
    logo.setDepth(10);

    this.tweens.add({
      targets: logo,
      alpha: 1,
      y: height * 0.18,
      duration: 850,
      ease: "Sine.easeOut",
    });

    this.tweens.add({
      targets: logo,
      scale: logoScale * 1.025,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 850,
    });
  }

  private createParticles(width: number, height: number) {
    const particles = this.add.particles(0, 0, "loading-particle", {
      x: {
        min: 0,
        max: width,
      },
      y: {
        min: height * 0.45,
        max: height + 40,
      },
      lifespan: {
        min: 3500,
        max: 7000,
      },
      speedY: {
        min: -18,
        max: -45,
      },
      speedX: {
        min: -8,
        max: 8,
      },
      scale: {
        start: 0.5,
        end: 0,
      },
      alpha: {
        start: 0.45,
        end: 0,
      },
      quantity: 1,
      frequency: 180,
      blendMode: "ADD",
    });

    particles.setDepth(5);

    const glowParticles = this.add.particles(0, 0, "loading-particle", {
      x: {
        min: width * 0.2,
        max: width * 0.8,
      },
      y: {
        min: height * 0.55,
        max: height * 0.95,
      },
      lifespan: {
        min: 1800,
        max: 3500,
      },
      speedY: {
        min: -10,
        max: -25,
      },
      scale: {
        start: 1,
        end: 0,
      },
      alpha: {
        start: 0.25,
        end: 0,
      },
      quantity: 1,
      frequency: 420,
      blendMode: "ADD",
    });

    glowParticles.setDepth(6);
  }

  private createLoadingBar(width: number, height: number) {
    this.barWidth = Math.min(width * 0.68, 420);
    this.barHeight = 16;

    this.barX = (width - this.barWidth) / 2;
    this.barY = height * 0.78;

    this.progressGlow = this.add.graphics();
    this.progressGlow.setDepth(20);

    this.progressBox = this.add.graphics();
    this.progressBox.setDepth(21);

    this.progressBox.fillStyle(0x020811, 0.78);
    this.progressBox.fillRoundedRect(
      this.barX,
      this.barY,
      this.barWidth,
      this.barHeight,
      8,
    );

    this.progressBox.lineStyle(2, 0x5ee8ff, 0.9);
    this.progressBox.strokeRoundedRect(
      this.barX,
      this.barY,
      this.barWidth,
      this.barHeight,
      8,
    );

    this.progressBar = this.add.graphics();
    this.progressBar.setDepth(22);

    this.updateProgressBar(0);
  }

  private createLoadingText(width: number) {
    this.loadingText = this.add.text(
      width / 2,
      this.barY - 34,
      "Cargando...",
      {
        fontSize: `${Math.max(16, Math.round(width * 0.035))}px`,
        color: "#dff8ff",
        fontFamily: "Arial",
      },
    );

    this.loadingText.setOrigin(0.5);
    this.loadingText.setDepth(25);

    this.percentText = this.add.text(width / 2, this.barY + 34, "0%", {
      fontSize: `${Math.max(13, Math.round(width * 0.027))}px`,
      color: "#8eefff",
      fontFamily: "Arial",
    });

    this.percentText.setOrigin(0.5);
    this.percentText.setDepth(25);

    this.tweens.add({
      targets: this.loadingText,
      alpha: 0.45,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private updateProgressBar(value: number) {
    if (!this.progressBar || !this.progressGlow) return;

    const safeValue = Phaser.Math.Clamp(value, 0, 1);
    const fillWidth = Math.max((this.barWidth - 8) * safeValue, 4);

    this.progressBar.clear();
    this.progressGlow.clear();

    this.progressGlow.fillStyle(0x5ee8ff, 0.12);
    this.progressGlow.fillRoundedRect(
      this.barX - 6,
      this.barY - 6,
      fillWidth + 16,
      this.barHeight + 12,
      12,
    );

    this.progressGlow.fillStyle(0x5ee8ff, 0.08);
    this.progressGlow.fillRoundedRect(
      this.barX - 12,
      this.barY - 12,
      fillWidth + 28,
      this.barHeight + 24,
      16,
    );

    this.progressBar.fillStyle(0x1aaec2, 1);
    this.progressBar.fillRoundedRect(
      this.barX + 4,
      this.barY + 4,
      fillWidth,
      this.barHeight - 8,
      6,
    );

    this.progressBar.fillStyle(0xdff8ff, 0.65);
    this.progressBar.fillRoundedRect(
      this.barX + 5,
      this.barY + 5,
      Math.max(fillWidth * 0.55, 2),
      3,
      3,
    );

    this.progressBar.lineStyle(1, 0xdff8ff, 0.85);
    this.progressBar.strokeRoundedRect(
      this.barX + 4,
      this.barY + 4,
      fillWidth,
      this.barHeight - 8,
      6,
    );

    if (this.percentText) {
      this.percentText.setText(`${Math.round(safeValue * 100)}%`);
    }
  }

  private coverImage(
    image: Phaser.GameObjects.Image,
    targetWidth: number,
    targetHeight: number,
  ) {
    const scale = Math.max(targetWidth / image.width, targetHeight / image.height);

    image.setScale(scale);
  }
}