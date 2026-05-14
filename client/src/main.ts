import Phaser from "phaser";
import { gameConfig } from "./config/gameConfig";
import { setupMobileInput } from "./input/mobileInput";
import {
  initializeTelegram,
  lockLandscape,
  setupTelegramMobileLayout,
} from "./telegram/telegram";
import "./styles.css";

// 1. Initialize Telegram WebApp
const webApp = initializeTelegram();

// 2. Setup layout and force Landscape orientation immediately
setupTelegramMobileLayout();
if (webApp) {
    webApp.expand();
    try {
        lockLandscape();
    } catch (e) {
        console.warn("Orientation lock not supported by browser/platform.");
    }
}

setupMobileInput();

// 3. Start Phaser Game
// Simplemente llamamos a 'new Phaser.Game' sin asignarlo a una constante
new Phaser.Game(gameConfig); 
