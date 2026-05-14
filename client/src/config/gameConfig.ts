import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene";
import { LoadingScene } from "../scenes/LoadingScene";
import { MainMenuScene } from "../scenes/MainMenuScene";
import { LobbyScene } from "../scenes/LobbyScene";
import { GameScene } from "../scenes/GameScene";
import { ResultsScene } from "../scenes/ResultsScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  backgroundColor: "#111111",
  parent: "app",
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1200, x: 0 },
      debug: false,
    },
  },
  scene: [BootScene, LoadingScene, MainMenuScene, LobbyScene, GameScene, ResultsScene],
};