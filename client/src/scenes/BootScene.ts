import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Pick a random loading BG based on initial orientation.
    // Desktop/landscape → BG_Desktop_Loading, mobile/portrait → BG_Mobile_Loading.
    const portrait = window.innerHeight > window.innerWidth;
    const n = String(Math.floor(Math.random() * 7) + 1).padStart(2, "0");
    const prefix = portrait ? "BG_Mobile_Loading" : "BG_Desktop_Loading";
    this.load.image("loading-bg", `/assets/background/${prefix}_${n}.jpg`);

    this.load.image("logo", "/assets/ui/loading/arena-brawler-logo.png");
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
