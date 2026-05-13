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
    // fullscreen not available on this platform
  }

  if (isTelegramMobile()) {
    document.body.classList.add("telegram-mobile");
    // Lock to portrait for menu scenes — fullscreen must be active first
    lockPortrait();
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

export function lockPortrait() {
  if (screen.orientation?.lock) {
    screen.orientation.lock("portrait-primary").catch(
      () => screen.orientation.lock("portrait").catch(() => {}),
    );
  }
  const tg = getTelegramWebApp() as unknown as Record<string, unknown>;
  if (typeof tg?.unlockOrientation === "function") {
    (tg.unlockOrientation as () => void)();
  }
}

export function lockLandscape() {
  if (screen.orientation?.lock) {
    screen.orientation.lock("landscape-primary").catch(
      () => screen.orientation.lock("landscape").catch(() => {}),
    );
  }
  // Supplement with Telegram API once the device has rotated
  const tg = getTelegramWebApp() as unknown as Record<string, unknown>;
  setTimeout(() => {
    if (
      screen.orientation?.type?.startsWith("landscape") &&
      typeof tg?.lockOrientation === "function"
    ) {
      (tg.lockOrientation as () => void)();
    }
  }, 400);
}

export function enableGameplayLayout() {
  if (!isTelegramMobile()) return;
  document.body.classList.add("gameplay-mode");
  lockLandscape();
}

export function disableGameplayLayout() {
  document.body.classList.remove("gameplay-mode", "portrait-mode");
  lockPortrait();
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
