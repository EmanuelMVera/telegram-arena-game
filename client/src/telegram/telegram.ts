import type { ClientIdentity } from "../types/player";

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

let orientationListenerEnabled = false;

function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

function getTelegramUser(): TelegramUser | undefined {
  return getTelegramWebApp()?.initDataUnsafe?.user;
}

function getGuestId() {
  const key = "arena-brawler-guest-id";
  const existingId = sessionStorage.getItem(key);

  if (existingId) {
    return existingId;
  }

  const newId = `guest:${crypto.randomUUID()}`;
  sessionStorage.setItem(key, newId);

  return newId;
}

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function updateOrientationMode() {
  if (!isTelegramMobile()) return;

  if (isPortrait()) {
    document.body.classList.add("portrait-mode");
  } else {
    document.body.classList.remove("portrait-mode");
  }
}

export function initializeTelegram() {
  const tg = getTelegramWebApp();

  tg?.ready();
  tg?.expand();

  try {
    tg?.requestFullscreen?.();
  } catch {
    console.log("Fullscreen no disponible en esta plataforma");
  }

  if (isTelegramMobile()) {
    document.body.classList.add("telegram-mobile");
  }

  return tg;
}

export function isTelegramMobile() {
  const platform = getTelegramWebApp()?.platform;

  return platform === "android" || platform === "ios";
}

/*
  Esta función ya NO activa el aviso de girar pantalla.
  Solo deja preparada la clase base de Telegram Mobile.
*/

export function setupTelegramMobileLayout() {
  if (isTelegramMobile()) {
    document.body.classList.add("telegram-mobile");
  }
}

/*
  Se llama al entrar a GameScene.
  Activa:
  - controles táctiles mobile
  - aviso de girar celular si está vertical
*/

export function enableGameplayLayout() {
  if (!isTelegramMobile()) return;

  document.body.classList.add("gameplay-mode");

  if (!orientationListenerEnabled) {
    window.addEventListener("resize", updateOrientationMode);
    window.addEventListener("orientationchange", updateOrientationMode);
    orientationListenerEnabled = true;
  }

  updateOrientationMode();
}

/*
  Se llama al salir de GameScene.
  Desactiva:
  - controles táctiles mobile
  - aviso de girar celular
*/

export function disableGameplayLayout() {
  document.body.classList.remove("gameplay-mode");
  document.body.classList.remove("portrait-mode");
}

export function getClientIdentity(): ClientIdentity {
  const user = getTelegramUser();

  if (user?.id) {
    const name =
      user.username ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      `Player ${user.id}`;

    return {
      id: `telegram:${user.id}`,
      name,
      source: "telegram",
      photoUrl: user.photo_url,
    };
  }

  return {
    id: getGuestId(),
    name: "Guest Player",
    source: "guest",
  };
}