import Phaser from "phaser";
import { getClientIdentity } from "../telegram/telegram";

type MenuButtonConfig = {
  label: string;
  y: number;
  primary?: boolean;
  onClick: () => void;
};

export class MainMenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;

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
    this.background = this.add.image(
      width / 2,
      height / 2,
      "loading-background",
    );

    this.coverImage(this.background, width, height);
    this.background.setDepth(-30);

    const darkOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.3,
    );

    darkOverlay.setDepth(-20);

    const vignetteTop = this.add.rectangle(
      width / 2,
      0,
      width,
      height * 0.35,
      0x000000,
      0.25,
    );

    vignetteTop.setOrigin(0.5, 0);
    vignetteTop.setDepth(-15);

    const vignetteBottom = this.add.rectangle(
      width / 2,
      height,
      width,
      height * 0.35,
      0x000000,
      0.35,
    );

    vignetteBottom.setOrigin(0.5, 1);
    vignetteBottom.setDepth(-15);

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
    if (!this.textures.exists("loading-particle")) {
      this.createParticleTexture();
    }

    const softParticles = this.add.particles(0, 0, "loading-particle", {
      x: {
        min: 0,
        max: width,
      },
      y: {
        min: height * 0.35,
        max: height + 40,
      },
      lifespan: {
        min: 3500,
        max: 7500,
      },
      speedY: {
        min: -12,
        max: -34,
      },
      speedX: {
        min: -8,
        max: 8,
      },
      scale: {
        start: 0.45,
        end: 0,
      },
      alpha: {
        start: 0.32,
        end: 0,
      },
      quantity: 1,
      frequency: 230,
      blendMode: "ADD",
    });

    softParticles.setDepth(5);

    const centerGlowParticles = this.add.particles(0, 0, "loading-particle", {
      x: {
        min: width * 0.25,
        max: width * 0.75,
      },
      y: {
        min: height * 0.45,
        max: height * 0.9,
      },
      lifespan: {
        min: 1800,
        max: 3600,
      },
      speedY: {
        min: -8,
        max: -22,
      },
      speedX: {
        min: -4,
        max: 4,
      },
      scale: {
        start: 0.8,
        end: 0,
      },
      alpha: {
        start: 0.2,
        end: 0,
      },
      quantity: 1,
      frequency: 550,
      blendMode: "ADD",
    });

    centerGlowParticles.setDepth(6);
  }

  private createLogo(width: number, height: number) {
    this.logo = this.add.image(width / 2, height * 0.17, "arena-brawler-logo");

    const logoMaxWidth = width * 0.84;
    const logoMaxHeight = height * 0.2;

    const logoScale = Math.min(
      logoMaxWidth / this.logo.width,
      logoMaxHeight / this.logo.height,
      1,
    );

    this.logo.setScale(logoScale);
    this.logo.setDepth(20);
    this.logo.setAlpha(0);

    this.tweens.add({
      targets: this.logo,
      alpha: 1,
      y: height * 0.15,
      duration: 700,
      ease: "Sine.easeOut",
    });

    this.tweens.add({
      targets: this.logo,
      scale: logoScale * 1.025,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 700,
    });
  }

  private createPlayerPanel(width: number, height: number) {
    const identity = getClientIdentity();

    const panelWidth = Math.min(width * 0.78, 420);
    const panelHeight = 92;
    const panelX = width / 2;
    const panelY = height * 0.34;

    const panel = this.add.graphics();
    panel.setDepth(15);

    panel.fillStyle(0x020811, 0.58);
    panel.fillRoundedRect(
      panelX - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      18,
    );

    panel.lineStyle(1.5, 0x5ee8ff, 0.55);
    panel.strokeRoundedRect(
      panelX - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      18,
    );

    const avatarX = panelX - panelWidth / 2 + 58;
    const avatarY = panelY;

    const avatarGlow = this.add.circle(avatarX, avatarY, 31, 0x5ee8ff, 0.18);
    avatarGlow.setDepth(16);

    const avatar = this.add.circle(avatarX, avatarY, 25, 0x07111d, 0.95);
    avatar.setStrokeStyle(2, 0x8eefff, 0.85);
    avatar.setDepth(17);

    const initial = identity.name.charAt(0).toUpperCase();

    const avatarLetter = this.add.text(avatarX, avatarY, initial, {
      fontSize: "24px",
      color: "#dff8ff",
      fontFamily: "Arial",
      fontStyle: "bold",
    });

    avatarLetter.setOrigin(0.5);
    avatarLetter.setDepth(18);

    const nameText = this.add.text(
      avatarX + 48,
      panelY - 18,
      identity.name,
      {
        fontSize: `${Math.max(16, Math.round(width * 0.037))}px`,
        color: "#dff8ff",
        fontFamily: "Arial",
        fontStyle: "bold",
      },
    );

    nameText.setOrigin(0, 0.5);
    nameText.setDepth(18);

    const sourceText =
      identity.source === "telegram"
        ? "Conectado con Telegram"
        : "Jugador invitado";

    const connectionText = this.add.text(avatarX + 48, panelY + 16, sourceText, {
      fontSize: `${Math.max(12, Math.round(width * 0.026))}px`,
      color: "#8eefff",
      fontFamily: "Arial",
    });

    connectionText.setOrigin(0, 0.5);
    connectionText.setDepth(18);
  }

  private createMenuButtons(width: number, height: number) {
    const startY = height * 0.52;
    const gap = Math.min(68, height * 0.1);

    const buttons: MenuButtonConfig[] = [
      {
        label: "CREAR PARTIDA",
        y: startY,
        primary: true,
        onClick: () => {
          this.showTemporaryMessage("Crear partida estará disponible pronto.");
        },
      },
      {
        label: "UNIRSE A PARTIDA",
        y: startY + gap,
        onClick: () => {
          this.showTemporaryMessage("Unirse por código estará disponible pronto.");
        },
      },
      {
        label: "ENTRAR A ARENA",
        y: startY + gap * 2,
        onClick: () => {
          this.cameras.main.fadeOut(350, 0, 0, 0);

          this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("GameScene");
          });
        },
      },
    ];

    buttons.forEach((button) => {
      this.createMenuButton(width, button);
    });
  }

  private createMenuButton(width: number, config: MenuButtonConfig) {
    const buttonWidth = Math.min(width * 0.74, 390);
    const buttonHeight = 52;
    const buttonX = width / 2;
    const buttonY = config.y;

    const container = this.add.container(buttonX, buttonY);
    container.setDepth(30);

    const background = this.add.graphics();

    const fillColor = config.primary ? 0x0b3a4a : 0x061b28;
    const fillAlpha = config.primary ? 0.88 : 0.72;
    const borderColor = config.primary ? 0x8eefff : 0x5ee8ff;

    background.fillStyle(fillColor, fillAlpha);
    background.fillRoundedRect(
      -buttonWidth / 2,
      -buttonHeight / 2,
      buttonWidth,
      buttonHeight,
      16,
    );

    background.lineStyle(2, borderColor, config.primary ? 0.95 : 0.65);
    background.strokeRoundedRect(
      -buttonWidth / 2,
      -buttonHeight / 2,
      buttonWidth,
      buttonHeight,
      16,
    );

    const glow = this.add.graphics();

    glow.fillStyle(0x5ee8ff, config.primary ? 0.1 : 0.05);
    glow.fillRoundedRect(
      -buttonWidth / 2 - 6,
      -buttonHeight / 2 - 6,
      buttonWidth + 12,
      buttonHeight + 12,
      20,
    );

    const label = this.add.text(0, 0, config.label, {
      fontSize: "18px",
      color: "#dff8ff",
      fontFamily: "Arial",
      fontStyle: "bold",
      letterSpacing: 1,
    });

    label.setOrigin(0.5);

    container.add([glow, background, label]);

    const hitArea = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    container.add(hitArea);

    hitArea.on("pointerover", () => {
      this.tweens.add({
        targets: container,
        scale: 1.035,
        duration: 120,
        ease: "Sine.easeOut",
      });
    });

    hitArea.on("pointerout", () => {
      this.tweens.add({
        targets: container,
        scale: 1,
        duration: 120,
        ease: "Sine.easeOut",
      });
    });

    hitArea.on("pointerdown", () => {
      this.tweens.add({
        targets: container,
        scale: 0.97,
        duration: 80,
        yoyo: true,
        ease: "Sine.easeInOut",
      });

      config.onClick();
    });

    if (config.primary) {
      this.tweens.add({
        targets: glow,
        alpha: 0.35,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private createFooter(width: number, height: number) {
    const footer = this.add.text(
      width / 2,
      height - 28,
      "Prototipo multijugador online",
      {
        fontSize: "12px",
        color: "#6f95a8",
        fontFamily: "Arial",
      },
    );

    footer.setOrigin(0.5);
    footer.setDepth(30);
  }

  private showTemporaryMessage(message: string) {
    const { width, height } = this.scale;

    const toast = this.add.text(width / 2, height * 0.9, message, {
      fontSize: "13px",
      color: "#dff8ff",
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      padding: {
        x: 12,
        y: 8,
      },
      fontFamily: "Arial",
    });

    toast.setOrigin(0.5);
    toast.setDepth(100);
    toast.setAlpha(0);

    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: height * 0.86,
      duration: 180,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: toast,
            alpha: 0,
            y: height * 0.82,
            duration: 250,
            ease: "Sine.easeIn",
            onComplete: () => {
              toast.destroy();
            },
          });
        });
      },
    });
  }

  private createParticleTexture() {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x8eefff, 1);
    graphics.fillCircle(4, 4, 4);

    graphics.generateTexture("loading-particle", 8, 8);
    graphics.destroy();
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