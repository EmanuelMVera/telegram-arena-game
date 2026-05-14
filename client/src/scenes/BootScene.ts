import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Select a random background index from 01 to 07
    const randomIdx = Phaser.Math.Between(1, 7).toString().padStart(2, '0');
    const bgKey = `BG_Loading_${randomIdx}`;
    
    // Store the selected key in the registry so LoadingScene can use it
    this.registry.set('selectedLoadingBG', bgKey);

    // Load the specific random background
    this.load.image(
      "loading-background",
      `/assets/background/BG_Loading_${randomIdx}.jpg`
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
