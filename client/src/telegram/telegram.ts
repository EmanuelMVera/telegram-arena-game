import type { ClientIdentity } from "../types/player";

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const PLAYER_ALIAS_STORAGE_KEY = "arena-brawler-player-alias";
const AVATAR_INDEX_KEY = "arena-brawler-avatar-index";

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

function getDefaultDisplayNameFromTelegram() {
  const user = getTelegramUser();

  if (!user) {
    return "Guest Player";
  }

  return (
    user.username ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    (user.id ? `Player ${user.id}` : "Player")
  );
}

export function getSavedAvatarIndex(): number {
  return parseInt(localStorage.getItem(AVATAR_INDEX_KEY) ?? "0", 10);
}

export function saveAvatarIndex(index: number): void {
  localStorage.setItem(AVATAR_INDEX_KEY, String(index));
}

export function getSavedAlias() {
  const alias = localStorage.getItem(PLAYER_ALIAS_STORAGE_KEY)?.trim();
  return alias || null;
}

export function savePlayerAlias(alias: string) {
  const cleanAlias = alias.trim();

  if (!cleanAlias) {
    localStorage.removeItem(PLAYER_ALIAS_STORAGE_KEY);
    return;
  }

  localStorage.setItem(PLAYER_ALIAS_STORAGE_KEY, cleanAlias.slice(0, 24));
}

export function getPlayerDisplayName() {
  return getSavedAlias() || getDefaultDisplayNameFromTelegram() || "Player";
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

export function setupTelegramMobileLayout() {
  if (isTelegramMobile()) {
    document.body.classList.add("telegram-mobile");
  }
}

export function enableGameplayLayout() {
  if (!isTelegramMobile()) return;
  document.body.classList.add("gameplay-mode");
  const tg = getTelegramWebApp() as unknown as Record<string, unknown>;
  if (typeof tg?.lockOrientation === "function") {
    (tg.lockOrientation as () => void)();
  } else {
    screen.orientation?.lock?.("landscape").catch(() => {});
  }
}

export function disableGameplayLayout() {
  document.body.classList.remove("gameplay-mode", "portrait-mode");
  const tg = getTelegramWebApp() as unknown as Record<string, unknown>;
  if (typeof tg?.unlockOrientation === "function") {
    (tg.unlockOrientation as () => void)();
  } else {
    try { screen.orientation?.unlock?.(); } catch {}
  }
}

export function getClientIdentity(): ClientIdentity {
  const user = getTelegramUser();

  if (user?.id) {
    return {
      id: `telegram:${user.id}`,
      name: getPlayerDisplayName(),
      source: "telegram",
      photoUrl: user.photo_url,
    };
  }

  return {
    id: getGuestId(),
    name: getPlayerDisplayName(),
    source: "guest",
  };
}
