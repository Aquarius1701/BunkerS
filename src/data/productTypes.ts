export interface ProductTypeItem {
  id: string;
  label: string;
  isCustom?: boolean;
}

// Boshlang'ich ro'yxat bo'sh - Admin kabineti ta'minotchi qo'shayotganda qo'lda kiritadi
export const INITIAL_PRODUCT_TYPES: ProductTypeItem[] = [
  { id: 'sement_m500', label: 'Sement M500 / M400' },
  { id: 'armatura_metall', label: 'Armatura va po‘lat prokat' },
  { id: 'gazoblok_d500', label: 'Gazoblok va penoblok' },
  { id: 'pishiq_gisht', label: 'Pishiq g‘isht va keramika' },
  { id: 'suvoq_qorishmalar', label: 'Suvoq va shpaklyovka qorishmalari' },
  { id: 'bazalt_izolyatsiya', label: 'Bazalt va penoplast issiqlik izolyatsiyasi' },
  { id: 'tom_yopish', label: 'Tom yopish (Bikrost, Profnastil)' },
  { id: 'truba_profil', label: 'Profil truba va shveller' },
];

const STORAGE_KEY = 'bunkerstroy_product_types';

function sanitizeTypes(types: ProductTypeItem[]): ProductTypeItem[] {
  const seen = new Set<string>();
  const result: ProductTypeItem[] = [];

  for (const item of types) {
    const trimmed = item.label ? item.label.trim() : '';
    if (!trimmed || trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push({
      ...item,
      label: trimmed,
    });
  }

  return result;
}

export function getProductTypes(): ProductTypeItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_PRODUCT_TYPES;
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return sanitizeTypes(parsed);
    }
    return INITIAL_PRODUCT_TYPES;
  } catch {
    return INITIAL_PRODUCT_TYPES;
  }
}

export function saveProductTypes(types: ProductTypeItem[]) {
  try {
    const sanitized = sanitizeTypes(types);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('bunkerstroy_product_types_updated', { detail: sanitized }));
  } catch (e) {
    console.error('Failed to save product types:', e);
  }
}

export function addProductType(newLabel: string): ProductTypeItem[] {
  const trimmed = newLabel.trim();
  if (!trimmed || trimmed.length < 2) return getProductTypes();

  const current = getProductTypes();
  const exists = current.some(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase() || t.id.toLowerCase() === trimmed.toLowerCase()
  );

  if (exists) {
    return current;
  }

  const filtered = current.filter((t) => {
    if (t.isCustom && t.label.length < trimmed.length && trimmed.toLowerCase().startsWith(t.label.toLowerCase())) {
      return false;
    }
    return true;
  });

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9а-яёўқғҳ]+/gi, '_')
    .replace(/^_+|_+$/g, '');

  const newItem: ProductTypeItem = {
    id: slug || `type_${Date.now()}`,
    label: trimmed,
    isCustom: true,
  };

  const updated = [...filtered, newItem];
  saveProductTypes(updated);
  return updated;
}

// ============================================================================
// ISHLAB CHIQARILGAN DAVLATLAR RO'YXATI (Faqat mahsulotga kiritilganda shakllanadi)
// ============================================================================
export const DEFAULT_ORIGIN_COUNTRIES: string[] = [
  'O‘zbekiston',
  'Qozog‘iston',
  'Rossiya',
  'Turkiya',
  'Germaniya',
];

export function isCabinetCompanyName(val?: string): boolean {
  if (!val) return true;
  const lower = val.trim().toLowerCase();
  if (!lower || lower.length < 2) return true;
  if (
    lower.includes("mas'uliyati cheklangan") ||
    lower.includes('mas’uliyati cheklangan') ||
    lower.includes('jamiyati') ||
    lower.includes('mchj') ||
    lower.includes('national ai') ||
    lower.includes('dingtai') ||
    lower.includes('"') ||
    lower.includes('«') ||
    lower.includes('»') ||
    lower.includes('xk') ||
    lower.includes('ooo')
  ) {
    return true;
  }
  return false;
}

export function getManufacturers(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const pushUnique = (raw?: string) => {
    const trimmed = (raw || '').trim();
    if (!trimmed || trimmed.length < 2) return;
    if (isCabinetCompanyName(trimmed)) return;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    result.push(trimmed);
  };

  try {
    const savedProds = localStorage.getItem('bunkerstroy_products');
    if (savedProds) {
      const parsedProds = JSON.parse(savedProds);
      if (Array.isArray(parsedProds)) {
        parsedProds.forEach((p: any) => {
          if (p && p.saleChannel !== 'offline' && p.manufacturerName && !isCabinetCompanyName(p.manufacturerName)) {
            pushUnique(p.manufacturerName);
          }
        });
      }
    }
  } catch {}

  return result;
}

export function addManufacturer(newCountry: string): string[] {
  const current = getManufacturers();
  const trimmed = (newCountry || '').trim();
  if (!trimmed || trimmed.length < 2 || isCabinetCompanyName(trimmed)) {
    return current;
  }
  const exists = current.some((m) => m.toLowerCase() === trimmed.toLowerCase());
  const next = exists ? current : [trimmed, ...current];
  try {
    window.dispatchEvent(new CustomEvent('bunkerstroy_manufacturers_updated', { detail: next }));
  } catch {}
  return next;
}

