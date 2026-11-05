import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Smartphone, Zap, WifiOff, Bell, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaInstallPromptProps {
  className?: string;
  quietPeriodDays?: number;
  onInstalled?: () => void;
  onDismissed?: () => void;
}

const STORAGE_DISMISS_KEY = 'bunkerstroy_pwa_install_dismissed_at';
const STORAGE_INSTALLED_KEY = 'bunkerstroy_pwa_is_installed';
const DEFAULT_QUIET_DAYS = 3;

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  className = '',
  quietPeriodDays = DEFAULT_QUIET_DAYS,
  onInstalled,
  onDismissed,
}) => {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [showInstalledToast, setShowInstalledToast] = useState<boolean>(false);

  // Check if app is running in standalone mode (already installed)
  const isAlreadyStandalone = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const isStandaloneWindow = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone =
      'standalone' in window.navigator &&
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
    const isStoredInstalled = localStorage.getItem(STORAGE_INSTALLED_KEY) === 'true';
    return isStandaloneWindow || isIosStandalone || isStoredInstalled;
  }, []);

  // Check if the user dismissed the banner recently (within quiet period)
  const isDismissQuietPeriodActive = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(STORAGE_DISMISS_KEY);
      if (!raw) return false;
      const dismissedAt = parseInt(raw, 10);
      if (isNaN(dismissedAt)) return false;
      const quietPeriodMs = quietPeriodDays * 24 * 60 * 60 * 1000;
      return Date.now() - dismissedAt < quietPeriodMs;
    } catch {
      return false;
    }
  }, [quietPeriodDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isAlreadyStandalone() || isDismissQuietPeriodActive()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      // Prevent default mini-infobar or browser prompt
      event.preventDefault();
      const pwaEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(pwaEvent);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      try {
        localStorage.setItem(STORAGE_INSTALLED_KEY, 'true');
        localStorage.removeItem(STORAGE_DISMISS_KEY);
      } catch {}

      setShowInstalledToast(true);
      if (onInstalled) {
        onInstalled();
      }

      // Hide toast after 4 seconds
      const timer = window.setTimeout(() => {
        setShowInstalledToast(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isAlreadyStandalone, isDismissQuietPeriodActive, onInstalled]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsVisible(false);
        setDeferredPrompt(null);
        try {
          localStorage.setItem(STORAGE_INSTALLED_KEY, 'true');
        } catch {}
      } else {
        handleDismiss();
      }
    } catch (err) {
      console.warn('[PWA] Install prompt failed or cancelled:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_DISMISS_KEY, Date.now().toString());
    } catch {}

    setIsVisible(false);
    if (onDismissed) {
      onDismissed();
    }
  };

  // Translations
  const titleText = t(
    'BunkerStroy Ilovasini O‘rnatish',
    'Установить приложение BunkerStroy',
    'BunkerStroy Иловасини Ўрнатиш'
  );

  const descText = t(
    'Oflayn ishlash, tezroq yuklanish va push-bildirishnomalar.',
    'Работа офлайн, быстрая загрузка и push-уведомления.',
    'Офлайн ишлаш, тезроқ юкланиш ва push-билдиришномалар.'
  );

  const perkFastText = t('Tezkor yuklanish', 'Быстрая загрузка', 'Тезкор юкланиш');
  const perkOfflineText = t('Oflayn rejim', 'Офлайн режим', 'Офлайн режим');
  const perkPushText = t('Push-bildirishnomalar', 'Push-уведомления', 'Push-билдиришномалар');

  const installBtnText = t('O‘rnatish / Установить', 'Установить', 'Ўрнатиш');
  const dismissBtnText = t('Keyinroq / Позже', 'Позже', 'Кейинроқ');
  const installedSuccessText = t(
    'BunkerStroy ilovasi muvaffaqiyatli o‘rnatildi!',
    'Приложение BunkerStroy успешно установлено!',
    'BunkerStroy иловаси муваффақиятли ўрнатилди!'
  );

  return (
    <>
      {/* Temporary Success Toast on App Install */}
      {showInstalledToast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-50 flex items-center gap-3 p-4 bg-emerald-950/95 border border-emerald-500/50 text-emerald-100 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{installedSuccessText}</h4>
            <p className="text-xs text-emerald-300/80 mt-0.5">
              {t(
                'Endi bosh ekrandan to‘g‘ridan-to‘g‘ri kiring.',
                'Теперь запускайте прямо с главного экрана.',
                'Энди бош экрандан тўғридан-тўғри киринг.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInstalledToast(false)}
            className="ml-auto text-emerald-400/80 hover:text-white p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* Main Floating Install Banner */}
      {isVisible && (
        <aside
          role="dialog"
          aria-labelledby="pwa-install-title"
          aria-describedby="pwa-install-desc"
          className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 rounded-2xl bg-gradient-to-br from-[#0F2547]/95 via-[#0A1931]/95 to-[#071326]/95 border border-cyan-500/30 text-white shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl p-4 sm:p-5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-6 ${className}`}
        >
          {/* Close X button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            aria-label="Close install prompt"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3.5">
            {/* App Icon preview badge */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-0.5 shadow-lg shadow-cyan-500/20 shrink-0">
              <div className="w-full h-full bg-[#071326] rounded-[14px] flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-cyan-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0 pr-4">
              <h3 id="pwa-install-title" className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{titleText}</span>
              </h3>
              <p id="pwa-install-desc" className="text-xs text-slate-300/90 mt-1 leading-relaxed">
                {descText}
              </p>
            </div>
          </div>

          {/* Value proposition badges */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 my-3.5 pt-1">
            <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 border border-white/10 rounded-xl text-[11px] text-slate-200 font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{perkFastText}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 border border-white/10 rounded-xl text-[11px] text-slate-200 font-medium">
              <WifiOff className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{perkOfflineText}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 border border-white/10 rounded-xl text-[11px] text-slate-200 font-medium">
              <Bell className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{perkPushText}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{isInstalling ? '...' : installBtnText}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="py-2.5 px-3.5 rounded-xl font-medium text-xs sm:text-sm text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] transition-all cursor-pointer"
            >
              {dismissBtnText}
            </button>
          </div>
        </aside>
      )}
    </>
  );
};
