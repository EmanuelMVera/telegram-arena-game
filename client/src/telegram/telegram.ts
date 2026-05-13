import type { ClientIdentity } from "../types/player";

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

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

export function initializeTelegram() {
  const tg = getTelegramWebApp();

  tg?.ready();
  tg?.expand();

  try {
    tg?.requestFullscreen?.();
  } catch {
    console.log("Fullscreen no disponible en esta plataforma");
  }

  return tg;
}

export function isTelegramMobile() {
  const platform = getTelegramWebApp()?.platform;

  return platform === "android" || platform === "ios";
}

export function setupTelegramMobileLayout() {
  const mobile = isTelegramMobile();

  if (mobile) {
    document.body.classList.add("telegram-mobile");
  }

  function isPortrait() {
    return window.innerHeight > window.innerWidth;
  }

  function updateOrientationMode() {
    if (!mobile) return;

    if (isPortrait()) {
      document.body.classList.add("portrait-mode");
    } else {
      document.body.classList.remove("portrait-mode");
    }
  }

  window.addEventListener("resize", updateOrientationMode);
  window.addEventListener("orientationchange", updateOrientationMode);

  updateOrientationMode();
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
