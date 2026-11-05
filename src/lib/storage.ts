/**
 * ==============================================================================
 * BunkerS Enterprise Safe Storage (DRY Utility Layer)
 * Handles LocalStorage access safely with JSON serialization, error boundaries,
 * quota management, and multi-tab/in-app synchronization events.
 * ==============================================================================
 */

export const STORAGE_KEYS = {
  ORDERS: 'bunkerstroy_orders',
  SUPPLIERS: 'bunkerstroy_suppliers',
  VEHICLES: 'bunkerstroy_vehicles',
  PRODUCTS: 'bunkerstroy_products',
  CUSTOMERS: 'bunkerstroy_customers',
  ACTIVE_USER: 'bunkerstroy_active_user',
  ACTIVE_TAB: 'bunkerstroy_active_tab',
  CART: 'bunkerstroy_cart',
  SAVED_ITEMS: 'bunkerstroy_saved_items',
  ADMIN_CONFIG: 'bunkerstroy_admin_config',
  CRM_DEBTS: 'bunkerstroy_crm_debts',
  B2B_ORDERS: 'bunkerstroy_b2b_orders',
  CABINET_LOGS: 'bunkerstroy_cabinet_logs',
  APP_LANG: 'bunkerstroy_app_lang',
  AUTH_TOKEN: 'bunkerstroy_auth_token',
  AUTH_USER: 'bunkerstroy_auth_user',
  PWA_INSTALL_DISMISSED: 'bunkerstroy_pwa_install_dismissed_at',
  PWA_IS_INSTALLED: 'bunkerstroy_pwa_is_installed',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS] | string;

/**
 * Safely retrieve an item from localStorage with JSON parsing and fallback.
 */
export function getStorageItem<T>(key: StorageKey, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[SafeStorage] Failed to read key "${key}":`, err);
    return defaultValue;
  }
}

/**
 * Safely store an item in localStorage with JSON serialization and event dispatch.
 * Automatically tries to recover if storage quota is exceeded.
 */
export function setStorageItem<T>(
  key: StorageKey,
  value: T,
  dispatchEventName?: string
): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);

    if (dispatchEventName) {
      window.dispatchEvent(new CustomEvent(dispatchEventName, { detail: value }));
    }
    // Also trigger standard storage event for cross-tab listeners
    window.dispatchEvent(new Event('storage'));
    return true;
  } catch (err: unknown) {
    console.error(`[SafeStorage] Failed to write key "${key}":`, err);

    // If quota exceeded, attempt a safe lightweight fallback if applicable
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      try {
        console.warn(`[SafeStorage] Quota exceeded on key "${key}". Cleaning non-essential caches.`);
        // Try to clear temporary items
        sessionStorage.clear();
      } catch {}
    }
    return false;
  }
}

/**
 * Safely remove an item from localStorage.
 */
export function removeStorageItem(key: StorageKey, dispatchEventName?: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(key);
    if (dispatchEventName) {
      window.dispatchEvent(new CustomEvent(dispatchEventName));
    }
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn(`[SafeStorage] Failed to remove key "${key}":`, err);
  }
}

/**
 * Safe JSON parser with fallback
 */
export function safeJsonParse<T>(raw: string | null | undefined, defaultValue: T): T {
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}
