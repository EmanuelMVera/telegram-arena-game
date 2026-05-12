/// <reference types="vite/client" />

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  unlockOrientation?: () => void;
  platform?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
