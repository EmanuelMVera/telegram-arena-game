import Phaser from "phaser";
import { getClientIdentity } from "../telegram/telegram";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenuScene");
  }

  create() {
    const { width, height } = this.scale;
    const identity = getClientIdentity();

    this.cameras.main.setBackgroundColor("#07111d");

    this.add.text(width / 2, height * 0.18, "Arena Brawler 2D", {
      fontSize: "32px",
      color: "#dff8ff",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.3, `Jugador: ${identity.name}`, {
      fontSize: "18px",
      color: "#8eefff",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    const playButton = this.add.text(width / 2, height * 0.52, "JUGAR", {
      fontSize: "26px",
      color: "#ffffff",
      backgroundColor: "#0b3a4a",
      padding: {
        x: 42,
        y: 16,
      },
      fontFamily: "Arial",
    });

    playButton.setOrigin(0.5);
    playButton.setInteractive({ useHandCursor: true });

    playButton.on("pointerdown", () => {
      this.scene.start("GameScene");
    });

    this.add.text(
      width / 2,
      height * 0.72,
      "Próximamente: Crear lobby / Unirse a partida",
      {
        fontSize: "14px",
        color: "#8aa6b5",
        fontFamily: "Arial",
      },
    ).setOrigin(0.5);
  }
}