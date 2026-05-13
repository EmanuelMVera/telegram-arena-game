/// <reference types="vite/client" />

interface TelegramWebAppUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  platform?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
