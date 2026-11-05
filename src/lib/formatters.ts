/**
 * ==============================================================================
 * BunkerS Enterprise Formatters & Sanitizers (DRY Utility Layer)
 * Centralizes currency, phone, tax ID (STIR/PINFL), and date/time formatting.
 * ==============================================================================
 */

/**
 * Format monetary amount into Uzbek So'm currency string
 * e.g. 1250000 -> "1 250 000 so'm"
 */
export function formatPrice(
  amount: number | string | null | undefined,
  options?: {
    suffix?: string;
    locale?: string;
    fallback?: string;
  }
): string {
  if (amount === null || amount === undefined || amount === '') {
    return options?.fallback ?? `0 ${options?.suffix ?? "so'm"}`;
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/\s/g, ''));
  if (isNaN(num)) {
    return options?.fallback ?? `0 ${options?.suffix ?? "so'm"}`;
  }

  const locale = options?.locale ?? 'uz-UZ';
  const suffix = options?.suffix !== undefined ? (options.suffix ? ` ${options.suffix}` : '') : " so'm";
  
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num) + suffix;
}

/**
 * Alias for formatPrice with standard suffix
 */
export const formatCurrency = formatPrice;

/**
 * Format plain number with thousand separators
 * e.g. 15000 -> "15 000"
 */
export function formatNumber(val: number | string | null | undefined, locale = 'uz-UZ'): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/\s/g, ''));
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Normalize and format Uzbekistan phone number
 * Standard visual format: +998 90 123 45 67
 */
export function formatUzPhone(val: string | null | undefined): string {
  if (!val) return '+998 ';
  
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, 9);
  
  if (digits.length === 0) return '+998 ';
  
  let formatted = '+998 ';
  if (digits.length > 0) formatted += digits.slice(0, 2);
  if (digits.length > 2) formatted += ' ' + digits.slice(2, 5);
  if (digits.length > 5) formatted += ' ' + digits.slice(5, 7);
  if (digits.length > 7) formatted += ' ' + digits.slice(7, 9);
  
  return formatted;
}

/**
 * Alias for formatUzPhone (for compatibility with existing form handlers)
 */
export const formatUzPhoneInput = formatUzPhone;

/**
 * Extract pure 9-digit local phone number without +998 or spaces
 * e.g. "+998 (90) 123-45-67" -> "901234567"
 */
export function getUzPhoneDigits(val: string | null | undefined): string {
  if (!val) return '';
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  return digits.slice(0, 9);
}

/**
 * Get count of valid local digits in phone input (0 to 9)
 */
export function getUzPhoneDigitsCount(val: string | null | undefined): number {
  return getUzPhoneDigits(val).length;
}

/**
 * Check if the phone number is a valid complete Uzbekistan mobile number
 */
export function isValidUzPhone(val: string | null | undefined): boolean {
  return getUzPhoneDigitsCount(val) === 9;
}

/**
 * Convert user phone input into E.164 format for API payloads
 * e.g. "+998 90 123 45 67" -> "+998901234567"
 */
export function toE164UzPhone(val: string | null | undefined): string {
  const digits = getUzPhoneDigits(val);
  return digits.length === 9 ? `+998${digits}` : val || '';
}

/**
 * Format and sanitize 9-digit STIR / INN
 */
export function formatStir(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\D/g, '').slice(0, 9);
}

/**
 * Validate 9-digit STIR / INN
 */
export function isValidStir(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^\d{9}$/.test(val.trim());
}

/**
 * Format and sanitize 14-digit JSHSHIR / PINFL
 */
export function formatPinfl(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\D/g, '').slice(0, 14);
}

/**
 * Validate 14-digit JSHSHIR / PINFL
 */
export function isValidPinfl(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^\d{14}$/.test(val.trim());
}

/**
 * Format Date into localized date string
 * e.g. "05.11.2026"
 */
export function formatDate(date: Date | string | number | null | undefined, locale = 'uz-UZ'): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format Date into localized date and time string
 * e.g. "05.11.2026, 14:30"
 */
export function formatDateTime(date: Date | string | number | null | undefined, locale = 'uz-UZ'): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Relative time ago formatter with Uzbek/Russian translations
 * e.g. "5 daqiqa oldin", "2 soat oldin", "kecha"
 */
export function formatTimeAgo(
  date: Date | string | number | null | undefined,
  lang: 'uz' | 'ru' | 'uz_cyrl' = 'uz'
): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);

    if (diffSec < 60) {
      if (lang === 'ru') return 'только что';
      if (lang === 'uz_cyrl') return 'ҳозиргина';
      return 'hozirgina';
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      if (lang === 'ru') return `${diffMin} мин. назад`;
      if (lang === 'uz_cyrl') return `${diffMin} дақиқа олдин`;
      return `${diffMin} daqiqa oldin`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      if (lang === 'ru') return `${diffHours} ч. назад`;
      if (lang === 'uz_cyrl') return `${diffHours} соат олдин`;
      return `${diffHours} soat oldin`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      if (lang === 'ru') return 'вчера';
      if (lang === 'uz_cyrl') return 'кеча';
      return 'kecha';
    }
    if (diffDays < 7) {
      if (lang === 'ru') return `${diffDays} дн. назад`;
      if (lang === 'uz_cyrl') return `${diffDays} кун олдин`;
      return `${diffDays} kun oldin`;
    }

    return formatDate(d);
  } catch {
    return '';
  }
}
