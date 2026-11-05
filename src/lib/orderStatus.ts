/**
 * ==============================================================================
 * BunkerS Enterprise Order Status Metadata & Helpers (DRY Presentation Layer)
 * Centralizes order lifecycle status definitions, badge styling, and multilingual labels.
 * ==============================================================================
 */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface OrderStatusMeta {
  status: OrderStatus;
  labelUz: string;
  labelRu: string;
  labelUzCyrl: string;
  badgeClass: string;
  dotColor: string;
  iconName: string;
}

export const ORDER_STATUS_MAP: Record<string, OrderStatusMeta> = {
  pending: {
    status: 'pending',
    labelUz: 'Kutilmoqda',
    labelRu: 'Ожидается',
    labelUzCyrl: 'Кутилмоқда',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
    iconName: 'Clock',
  },
  confirmed: {
    status: 'confirmed',
    labelUz: 'Tasdiqlandi',
    labelRu: 'Подтвержден',
    labelUzCyrl: 'Тасдиқланди',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotColor: 'bg-blue-500',
    iconName: 'CheckCircle2',
  },
  preparing: {
    status: 'preparing',
    labelUz: 'Tayyorlanmoqda',
    labelRu: 'Готовится',
    labelUzCyrl: 'Тайёрланмоқда',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotColor: 'bg-purple-500',
    iconName: 'Package',
  },
  ready: {
    status: 'ready',
    labelUz: 'Yuklashga tayyor',
    labelRu: 'Готов к отгрузке',
    labelUzCyrl: 'Юклашга тайёр',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotColor: 'bg-indigo-500',
    iconName: 'Boxes',
  },
  in_transit: {
    status: 'in_transit',
    labelUz: 'Yo‘lda',
    labelRu: 'В пути',
    labelUzCyrl: 'Йўлда',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotColor: 'bg-sky-500',
    iconName: 'Truck',
  },
  delivered: {
    status: 'delivered',
    labelUz: 'Yetkazildi',
    labelRu: 'Доставлен',
    labelUzCyrl: 'Етказилди',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
    iconName: 'ShieldCheck',
  },
  cancelled: {
    status: 'cancelled',
    labelUz: 'Bekor qilingan',
    labelRu: 'Отменен',
    labelUzCyrl: 'Бекор қилинган',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotColor: 'bg-rose-500',
    iconName: 'XCircle',
  },
};

/**
 * Get metadata for any order status string with safe fallback.
 */
export function getOrderStatusMeta(rawStatus?: string | null): OrderStatusMeta {
  const normalized = (rawStatus || 'pending').toLowerCase().trim();
  return (
    ORDER_STATUS_MAP[normalized] || {
      status: 'pending',
      labelUz: rawStatus || 'Noma‘lum',
      labelRu: rawStatus || 'Неизвестно',
      labelUzCyrl: rawStatus || 'Номаълум',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      dotColor: 'bg-slate-400',
      iconName: 'HelpCircle',
    }
  );
}

/**
 * Get localized order status label
 */
export function getOrderStatusLabel(
  rawStatus?: string | null,
  lang: 'uz' | 'ru' | 'uz_cyrl' = 'uz'
): string {
  const meta = getOrderStatusMeta(rawStatus);
  if (lang === 'ru') return meta.labelRu;
  if (lang === 'uz_cyrl') return meta.labelUzCyrl;
  return meta.labelUz;
}
