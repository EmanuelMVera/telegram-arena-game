import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.image(
      "loading-background",
      "/assets/ui/loading/loading-background.png",
    );

    this.load.image(
      "arena-brawler-logo",
      "/assets/ui/loading/arena-brawler-logo.png",
    );

    this.load.image("avatars", "/assets/avatars/avatars.png");
  }

  create() {
    this.createParticleTexture();

    this.scene.start("LoadingScene");
  }

  private createParticleTexture() {
    if (this.textures.exists("loading-particle")) return;

    const graphics = this.add.graphics();

    graphics.fillStyle(0x8eefff, 1);
    graphics.fillCircle(4, 4, 4);

    graphics.generateTexture("loading-particle", 8, 8);
    graphics.destroy();
  }
}