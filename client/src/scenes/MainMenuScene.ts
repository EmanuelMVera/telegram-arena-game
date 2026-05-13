import Phaser from "phaser";
import {
  getClientIdentity,
  getPlayerDisplayName,
  savePlayerAlias,
} from "../telegram/telegram";

type MenuButtonConfig = {
  label: string;
  y: number;
  primary?: boolean;
  onClick: () => void;
};

export class MainMenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private aliasText!: Phaser.GameObjects.Text;

  constructor() {
    super("MainMenuScene");
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#07111d");

    this.createBackground(width, height);
    this.createParticles(width, height);
    this.createLogo(width, height);
    this.createPlayerPanel(width, height);
    this.createMenuButtons(width, height);
    this.createFooter(width, height);

    this.cameras.main.fadeIn(450, 0, 0, 0);
  }

  private createBackground(width: number, height: number) {
    this.background = this.add.image(width / 2, height / 2, "loading-background");

    this.coverImage(this.background, width, height);
    this.background.setDepth(-30);

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45).setDepth(-20);
    this.add.rectangle(width / 2, 0, width, height * 0.35, 0x000000, 0.34).setOrigin(0.5, 0).setDepth(-15);
    this.add.rectangle(width / 2, height, width, height * 0.4, 0x000000, 0.44).setOrigin(0.5, 1).setDepth(-15);

    this.tweens.add({
      targets: this.background,
      scale: this.background.scale + 0.025,
      duration: 10000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private createParticles(width: number, height: number) {
    const softParticles = this.add.particles(0, 0, "loading-particle", {
      x: { min: 0, max: width },
      y: { min: height * 0.35, max: height + 40 },
      lifespan: { min: 3500, max: 7500 },
      speedY: { min: -12, max: -34 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.32, end: 0 },
      quantity: 1,
      frequency: 230,
      blendMode: "ADD",
    });

    softParticles.setDepth(5);
  }

  private createLogo(width: number, height: number) {
    this.logo = this.add.image(width / 2, height * 0.16, "arena-brawler-logo");

    const logoMaxWidth = width * 0.82;
    const logoMaxHeight = height * 0.2;
    const logoScale = Math.min(logoMaxWidth / this.logo.width, logoMaxHeight / this.logo.height, 1);

    this.logo.setScale(logoScale).setDepth(20);
  }

  private createPlayerPanel(width: number, height: number) {
    const identity = getClientIdentity();
    const panelWidth = Math.min(width * 0.84, 450);
    const panelHeight = 112;
    const panelX = width / 2;
    const panelY = height * 0.34;

    const panel = this.add.graphics().setDepth(15);
    panel.fillStyle(0x020811, 0.68);
    panel.fillRoundedRect(panelX - panelWidth / 2, panelY - panelHeight / 2, panelWidth, panelHeight, 18);
    panel.lineStyle(2, 0x5ee8ff, 0.55);
    panel.strokeRoundedRect(panelX - panelWidth / 2, panelY - panelHeight / 2, panelWidth, panelHeight, 18);

    const avatarX = panelX - panelWidth / 2 + 60;
    const avatarY = panelY;
    this.add.circle(avatarX, avatarY, 32, 0x5ee8ff, 0.18).setDepth(16);

    const photoKey = `tg-avatar-${identity.id}`;
    if (identity.photoUrl) {
      this.load.image(photoKey, identity.photoUrl);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (!this.scene.isActive()) return;
        if (this.textures.exists(photoKey)) {
          const avatarFrame = this.add.image(avatarX, avatarY, photoKey).setDepth(18);
          avatarFrame.setDisplaySize(50, 50);
          this.add.circle(avatarX, avatarY, 26).setStrokeStyle(2, 0x8eefff, 0.85).setDepth(19);
        }
      });
      this.load.start();
    } else {
      this.add.circle(avatarX, avatarY, 25, 0x07111d, 0.95).setStrokeStyle(2, 0x8eefff, 0.85).setDepth(17);
      this.add.text(avatarX, avatarY, getPlayerDisplayName().charAt(0).toUpperCase(), {
        fontSize: "24px",
        color: "#dff8ff",
        fontFamily: "Arial",
        fontStyle: "bold",
      }).setOrigin(0.5).setDepth(18);
    }

    this.aliasText = this.add.text(avatarX + 50, panelY - 18, getPlayerDisplayName(), {
      fontSize: `${Math.max(16, Math.round(width * 0.037))}px`,
      color: "#dff8ff",
      fontFamily: "Arial",
      fontStyle: "bold",
    }).setOrigin(0, 0.5).setDepth(18);

    this.add.text(avatarX + 50, panelY + 16, "Editar alias", {
      fontSize: `${Math.max(12, Math.round(width * 0.025))}px`,
      color: "#8eefff",
      fontFamily: "Arial",
      fontStyle: "bold",
    })
      .setOrigin(0, 0.5)
      .setDepth(18)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const currentAlias = getPlayerDisplayName();
        const newAlias = window.prompt("Ingresá tu alias de juego", currentAlias);
        if (newAlias === null) return;
        savePlayerAlias(newAlias);
        this.aliasText.setText(getPlayerDisplayName());
      });
  }

  private createMenuButtons(width: number, height: number) {
    const startY = height * 0.52;
    const gap = Math.min(68, height * 0.1);

    const buttons: MenuButtonConfig[] = [
      { label: "CREAR PARTIDA", y: startY, primary: true, onClick: () => this.showTemporaryMessage("Próximamente") },
      { label: "UNIRSE A PARTIDA", y: startY + gap, onClick: () => this.showTemporaryMessage("Próximamente") },
      { label: "ENTRAR A ARENA", y: startY + gap * 2, onClick: () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("GameScene"));
      } },
    ];

    buttons.forEach((button) => this.createMenuButton(width, button));
  }

  private createMenuButton(width: number, config: MenuButtonConfig) { /* existing */
    const buttonWidth = Math.min(width * 0.74, 430);
    const buttonHeight = 52;
    const x = width / 2;
    const y = config.y;
    const fillColor = config.primary ? 0x1aaec2 : 0x0b1c2f;
    const borderColor = config.primary ? 0x9df8ff : 0x5ee8ff;

    const graphics = this.add.graphics().setDepth(30);
    const drawButton = (hovered: boolean) => {
      graphics.clear();
      graphics.fillStyle(fillColor, hovered ? 0.95 : 0.82);
      graphics.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 14);
      graphics.lineStyle(2, borderColor, hovered ? 1 : 0.7);
      graphics.strokeRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 14);
    };
    drawButton(false);

    const label = this.add.text(x, y, config.label, { fontSize: `${Math.max(16, Math.round(width * 0.034))}px`, color: "#e9fdff", fontFamily: "Arial", fontStyle: "bold" }).setOrigin(0.5).setDepth(31);
    const hitArea = this.add.zone(x, y, buttonWidth, buttonHeight).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(32);
    hitArea.on("pointerover", () => drawButton(true));
    hitArea.on("pointerout", () => drawButton(false));
    hitArea.on("pointerdown", () => { drawButton(true); this.tweens.add({ targets: label, scale: 0.97, yoyo: true, duration: 90 }); config.onClick(); });
  }

  private showTemporaryMessage(message: string) {
    const { width, height } = this.scale;
    const toast = this.add.text(width / 2, height * 0.88, message, { fontSize: `${Math.max(13, Math.round(width * 0.026))}px`, color: "#dff8ff", fontFamily: "Arial", backgroundColor: "rgba(1, 8, 16, 0.75)", padding: { x: 12, y: 7 } }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: toast, alpha: 0, y: toast.y - 12, duration: 1300, ease: "Sine.easeIn", onComplete: () => toast.destroy() });
  }

  private createFooter(width: number, height: number) {
    this.add.text(width / 2, height * 0.96, "Arena Brawler 2D · Telegram Mini App", { fontSize: `${Math.max(10, Math.round(width * 0.018))}px`, color: "#a6d8e5", fontFamily: "Arial" }).setOrigin(0.5).setDepth(8).setAlpha(0.8);
  }

  private coverImage(image: Phaser.GameObjects.Image, targetWidth: number, targetHeight: number) {
    image.setScale(Math.max(targetWidth / image.width, targetHeight / image.height));
  }
}
