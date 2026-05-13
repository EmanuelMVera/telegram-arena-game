import Phaser from "phaser";
import { gameConfig } from "./config/gameConfig";
import { setupMobileInput } from "./input/mobileInput";
import {
  initializeTelegram,
  isTelegramMobile,
  lockLandscape,
  lockPortrait,
  setupTelegramMobileLayout,
} from "./telegram/telegram";
import "./styles.css";

initializeTelegram();
setupTelegramMobileLayout();
setupMobileInput();

new Phaser.Game(gameConfig);

// Rotation button — only active on Telegram mobile
if (isTelegramMobile()) {
  const btn = document.getElementById("btn-orientation") as HTMLButtonElement | null;
  if (btn) {
    let isLandscape = false;

    btn.addEventListener("pointerdown", () => {
      isLandscape = !isLandscape;
      if (isLandscape) {
        lockLandscape();
        btn.textContent = "⟲";
        btn.title = "Volver a vertical";
      } else {
        lockPortrait();
        btn.textContent = "⟳";
        btn.title = "Rotar a horizontal";
      }
    });

    // Keep button state in sync when orientation changes externally
    window.addEventListener("orientationchange", () => {
      const landscape = window.innerWidth > window.innerHeight;
      isLandscape = landscape;
      btn.textContent = landscape ? "⟲" : "⟳";
    });
  }
}