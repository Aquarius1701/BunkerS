import React, { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLanguage } from '../../lib/i18n';

export interface PwaReloadPromptProps {
  className?: string;
  checkIntervalMs?: number;
  showOfflineReadyToast?: boolean;
  onUpdated?: () => void;
  onDismissed?: () => void;
}

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export const PwaReloadPrompt: React.FC<PwaReloadPromptProps> = ({
  className = '',
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  showOfflineReadyToast = true,
  onUpdated,
  onDismissed,
}) => {
  const { t } = useLanguage();
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegistered(registration) {
      if (registration) {
        setSwRegistration(registration);
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service Worker registration failed:', error);
    },
  });

  // Periodic check for SW update and on window focus
  useEffect(() => {
    if (!swRegistration) return;

    const checkForUpdates = () => {
      try {
        swRegistration.update().catch((err: unknown) => {
          console.debug('[PWA] SW update check caught error:', err);
        });
      } catch (err) {
        console.debug('[PWA] SW update check failed:', err);
      }
    };

    // Periodic timer
    const intervalId = window.setInterval(checkForUpdates, checkIntervalMs);

    // Check on document visibility regain
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [swRegistration, checkIntervalMs]);

  // Auto-dismiss the offlineReady notification after 4.5 seconds
  useEffect(() => {
    if (offlineReady && showOfflineReadyToast) {
      const timer = window.setTimeout(() => {
        setOfflineReady(false);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [offlineReady, showOfflineReadyToast, setOfflineReady]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    if (onUpdated) {
      onUpdated();
    }
    try {
      // updateServiceWorker(true) will post SKIP_WAITING to the worker and trigger controllerchange
      await updateServiceWorker(true);
    } catch (err) {
      console.warn('[PWA] updateServiceWorker call failed, falling back to window.location.reload():', err);
      window.location.reload();
    }
  };

  const handleClose = () => {
    setNeedRefresh(false);
    if (onDismissed) {
      onDismissed();
    }
  };

  const handleCloseOfflineReady = () => {
    setOfflineReady(false);
  };

  // Translations
  const reloadTitle = t(
    'Yangi versiya yuklandi!',
    'Доступна новая версия!',
    'Янги версия юкланди!'
  );

  const reloadDesc = t(
    'Yangi versiya yuklandi! Yangilanishlarni qo‘llash uchun sahifani yangilang.',
    'Новая версия загружена! Обновите страницу, чтобы применить обновления.',
    'Янги версия юкланди! Янгиланишларни қўллаш учун саҳифани янгиланг.'
  );

  const updateBtnText = t('Yangilash', 'Обновить', 'Янгилаш');
  const closeBtnText = t('Yopish', 'Закрыть', 'Ёпиш');

  const offlineReadyTitle = t(
    'Oflayn rejim faollashdi',
    'Офлайн-режим активирован',
    'Офлайн режим фаоллашди'
  );

  const offlineReadyDesc = t(
    'Ilova oflayn ishlashga tayyor (keshlangan ma\'lumotlar mavjud).',
    'Приложение готово к работе в офлайн-режиме.',
    'Илова офлайн ишлашга тайёр (кешланган маълумотлар мавжуд).'
  );

  return (
    <>
      {/* Offline Ready Toast Notification */}
      {offlineReady && showOfflineReadyToast && !needRefresh && (
        <aside
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 flex items-center gap-3 p-3.5 sm:p-4 bg-[#0A1931]/95 border border-cyan-500/40 text-cyan-100 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm ${className}`}
        >
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate">{offlineReadyTitle}</h4>
            <p className="text-[11px] sm:text-xs text-cyan-300/80 mt-0.5 line-clamp-2">
              {offlineReadyDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseOfflineReady}
            className="p-1 text-cyan-300/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* Need Refresh / New Version Update Notification Toast */}
      {needRefresh && (
        <aside
          role="alertdialog"
          aria-labelledby="pwa-reload-title"
          aria-describedby="pwa-reload-desc"
          className={`fixed top-4 sm:top-6 right-4 left-4 sm:left-auto sm:right-6 sm:max-w-md z-50 rounded-2xl bg-gradient-to-br from-[#0F2547]/95 via-[#0A1931]/95 to-[#071326]/95 border border-amber-500/40 text-white shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl p-4 sm:p-5 animate-in fade-in slide-in-from-top-4 duration-300 ${className}`}
        >
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 id="pwa-reload-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {reloadTitle}
                </h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  aria-label={closeBtnText}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p id="pwa-reload-desc" className="text-xs text-slate-300 mt-1 leading-relaxed">
                {reloadDesc}
              </p>

              <div className="flex items-center gap-2.5 mt-3.5">
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
                  <span>{isUpdating ? '...' : updateBtnText}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="py-2 px-3 rounded-xl font-medium text-xs sm:text-sm text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {closeBtnText}
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};
