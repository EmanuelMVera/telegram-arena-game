import Phaser from "phaser";
import { gameConfig } from "./config/gameConfig";
import { setupMobileInput } from "./input/mobileInput";
import { initializeTelegram, setupTelegramMobileLayout } from "./telegram/telegram";
import "./styles.css";

initializeTelegram();
setupTelegramMobileLayout();
setupMobileInput();

new Phaser.Game(gameConfig);
