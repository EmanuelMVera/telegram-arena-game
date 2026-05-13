import Phaser from "phaser";

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;

  constructor() {
    super("LoadingScene");
  }

  preload() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#07111d");

    this.createLoadingUi(width, height);

    this.load.on("progress", (value: number) => {
      this.updateProgressBar(value);
    });

    this.load.on("complete", () => {
      this.time.delayedCall(500, () => {
        this.scene.start("MainMenuScene");
      });
    });

    this.load.image(
      "loading-background",
      "/assets/ui/loading/loading-background.png",
    );

    this.load.image(
      "arena-brawler-logo",
      "/assets/ui/loading/arena-brawler-logo.png",
    );

    /*
      Acá después vamos a cargar más assets:
      - sprites de personajes
      - efectos
      - mapas
      - sonidos
    */
  }

  create() {
    const { width, height } = this.scale;

    const background = this.add.image(
      width / 2,
      height / 2,
      "loading-background",
    );

    this.coverImage(background, width, height);
    background.setDepth(-10);

    const logo = this.add.image(width / 2, height * 0.23, "arena-brawler-logo");

    const logoMaxWidth = width * 0.82;
    const logoScale = Math.min(logoMaxWidth / logo.width, 0.75);

    logo.setScale(logoScale);
    logo.setAlpha(0);

    this.tweens.add({
      targets: logo,
      alpha: 1,
      y: height * 0.21,
      duration: 700,
      ease: "Sine.easeOut",
    });
  }

  private createLoadingUi(width: number, height: number) {
    const barWidth = Math.min(width * 0.68, 420);
    const barHeight = 14;

    const barX = (width - barWidth) / 2;
    const barY = height * 0.78;

    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x020811, 0.75);
    this.progressBox.fillRoundedRect(barX, barY, barWidth, barHeight, 7);

    this.progressBox.lineStyle(2, 0x5ee8ff, 0.9);
    this.progressBox.strokeRoundedRect(barX, barY, barWidth, barHeight, 7);

    this.progressBar = this.add.graphics();

    this.loadingText = this.add.text(width / 2, barY - 34, "Cargando...", {
      fontSize: "18px",
      color: "#dff8ff",
      fontFamily: "Arial",
    });

    this.loadingText.setOrigin(0.5);

    this.percentText = this.add.text(width / 2, barY + 30, "0%", {
      fontSize: "14px",
      color: "#8eefff",
      fontFamily: "Arial",
    });

    this.percentText.setOrigin(0.5);

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
    const { width, height } = this.scale;

    const barWidth = Math.min(width * 0.68, 420);
    const barHeight = 14;

    const barX = (width - barWidth) / 2;
    const barY = height * 0.78;

    this.progressBar.clear();

    this.progressBar.fillStyle(0x5ee8ff, 1);
    this.progressBar.fillRoundedRect(
      barX + 3,
      barY + 3,
      Math.max((barWidth - 6) * value, 6),
      barHeight - 6,
      5,
    );

    this.progressBar.lineStyle(1, 0xdff8ff, 0.75);
    this.progressBar.strokeRoundedRect(
      barX + 3,
      barY + 3,
      Math.max((barWidth - 6) * value, 6),
      barHeight - 6,
      5,
    );

    this.percentText.setText(`${Math.round(value * 100)}%`);
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