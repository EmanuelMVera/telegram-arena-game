import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene";
import { LoadingScene } from "../scenes/LoadingScene";
import { MainMenuScene } from "../scenes/MainMenuScene";
import { GameScene } from "../scenes/GameScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 900,
  height: 500,
  backgroundColor: "#111111",
  parent: "app",
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
  scene: [BootScene, LoadingScene, MainMenuScene, GameScene],
};