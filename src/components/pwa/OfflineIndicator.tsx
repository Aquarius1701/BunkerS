import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';

export interface OfflineIndicatorProps {
  className?: string;
  showToastDurationMs?: number;
  showDismissInBanner?: boolean;
  onStatusChange?: (isOnline: boolean) => void;
}

const DEFAULT_TOAST_DURATION_MS = 4000;

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = '',
  showToastDurationMs = DEFAULT_TOAST_DURATION_MS,
  showDismissInBanner = true,
  onStatusChange,
}) => {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [showOnlineToast, setShowOnlineToast] = useState<boolean>(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(false);

  // Keep ref of previous state to detect transition from offline to online
  const wasOfflineRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize wasOfflineRef based on initial state
    if (!navigator.onLine) {
      wasOfflineRef.current = true;
    }

    const handleOnline = () => {
      setIsOnline(true);
      setIsBannerDismissed(false); // Reset dismiss for next offline event
      if (onStatusChange) {
        onStatusChange(true);
      }

      // If transition from offline -> online occurred, show the temporary green toast
      if (wasOfflineRef.current) {
        setShowOnlineToast(true);
        wasOfflineRef.current = false;
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowOnlineToast(false);
      if (onStatusChange) {
        onStatusChange(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onStatusChange]);

  // Auto-hide online toast after duration
  useEffect(() => {
    if (!showOnlineToast) return;

    const timer = window.setTimeout(() => {
      setShowOnlineToast(false);
    }, showToastDurationMs);

    return () => clearTimeout(timer);
  }, [showOnlineToast, showToastDurationMs]);

  // Translations
  const offlineBannerText = t(
    '⚠️ Internet aloqasi uzildi. BunkerStroy oflayn rejimda ishlamoqda (keshlangan ma\'lumotlar mavjud).',
    '⚠️ Соединение с интернетом потеряно. BunkerStroy работает в офлайн-режиме (доступны кэшированные данные).',
    '⚠️ Интернет алоқаси узилди. BunkerStroy офлайн режимда ишламоқда (кешланган маълумотлар мавжуд).'
  );

  const onlineToastTitle = t(
    'Internet aloqasi tiklandi!',
    'Интернет-соединение восстановлено!',
    'Интернет алоқаси тикланди!'
  );

  const onlineToastDesc = t(
    'Onlayn rejim va sinxronizatsiya qayta tiklandi.',
    'Онлайн-режим и синхронизация данных возобновлены.',
    'Онлайн режим ва маълумотлар синхронизацияси қайта тикланди.'
  );

  const dismissLabel = t('Yopish', 'Закрыть', 'Ёпиш');

  return (
    <>
      {/* Offline Status Top Warning Banner */}
      {!isOnline && !isBannerDismissed && (
        <aside
          role="status"
          aria-live="polite"
          className={`fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-amber-950/95 via-rose-950/95 to-amber-950/95 border-b border-amber-500/40 text-amber-100 backdrop-blur-xl px-3 sm:px-6 py-2.5 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${className}`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
              </span>

              <div className="p-1 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>

              <p className="font-medium text-slate-100 leading-snug truncate sm:whitespace-normal">
                {offlineBannerText}
              </p>
            </div>

            {showDismissInBanner && (
              <button
                type="button"
                onClick={() => setIsBannerDismissed(true)}
                className="p-1 text-amber-300/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
                aria-label={dismissLabel}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Online Reconnected Temporary Green Toast */}
      {showOnlineToast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:right-6 sm:top-5 z-[70] flex items-center gap-3 p-3.5 sm:p-4 bg-emerald-950/95 border border-emerald-500/50 text-emerald-100 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300 max-w-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
            <Wifi className="w-5 h-5 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <h4 className="text-xs sm:text-sm font-bold text-white truncate">{onlineToastTitle}</h4>
            </div>
            <p className="text-[11px] sm:text-xs text-emerald-300/80 mt-0.5">
              {onlineToastDesc}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowOnlineToast(false)}
            className="p-1 text-emerald-400/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors ml-auto"
            aria-label={dismissLabel}
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}
    </>
  );
};
