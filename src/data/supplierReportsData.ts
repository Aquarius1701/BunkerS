import { SupplierSaleItem, SupplierReturnItem, SupplierLogisticsRoute, Order, Product, CommissionBasis, SupplierPartner } from '../types';

export interface SupplierDetailedReport {
  supplierId: string;
  companyName: string;
  responsiblePerson: string;
  phone: string;
  region: string;
  contractNumber: string;
  commissionRate: number;
  commissionBasis: CommissionBasis;
  totalSalesSum: number;
  totalProfitSum: number;
  totalCommissionSum: number;
  netPayoutSum: number;
  totalSoldQuantity: number;
  uniqueProductTypesCount: number;
  sales: SupplierSaleItem[];
  returns: SupplierReturnItem[];
  routes: SupplierLogisticsRoute[];
}

export type SupplierReportPeriod = 'all' | 'day' | 'month' | 'year';

export interface ProductSearchQueryLog {
  id: string;
  term: string;
  normalizedTerm?: string;
  region: string;
  userId?: string;
  resultsCount?: number;
  createdAt: string;
  timestamp?: string;
}

const SEARCH_LOGS_KEY = 'bunkerstroy_search_queries';

export const getProductSearchLogs = (): ProductSearchQueryLog[] => {
  try {
    const raw = localStorage.getItem(SEARCH_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item) => item && item.term);
        // Ketma-ket 15 soniya ichida bir xil foydalanuvchi tomonidan ikki marta yozilgan dublikatlarni tozalash
        const deduped: ProductSearchQueryLog[] = [];
        for (const entry of valid) {
          const norm = String(entry.normalizedTerm || entry.term || '').trim().toLowerCase();
          const entryTime = new Date(entry.createdAt || entry.timestamp || 0).getTime();
          const prev = deduped[deduped.length - 1];
          if (prev) {
            const prevNorm = String(prev.normalizedTerm || prev.term || '').trim().toLowerCase();
            const prevTime = new Date(prev.createdAt || prev.timestamp || 0).getTime();
            const sameUser = (prev.userId || '') === (entry.userId || '');
            if (
              prevNorm === norm &&
              sameUser &&
              Math.abs(prevTime - entryTime) < 15000
            ) {
              continue;
            }
          }
          deduped.push({
            ...entry,
            normalizedTerm: norm,
            createdAt: entry.createdAt || entry.timestamp || new Date().toISOString(),
            timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
          });
        }
        if (deduped.length !== valid.length) {
          try {
            localStorage.setItem(SEARCH_LOGS_KEY, JSON.stringify(deduped));
          } catch {}
        }
        return deduped;
      }
    }
  } catch {}
  return [];
};

export const recordProductSearchQuery = (
  rawTerm: string,
  rawRegion?: string,
  userId?: string,
  resultsCount?: number
): void => {
  const cleaned = (rawTerm || '').trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2) return;
  const formattedTerm = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  const normalizedTerm = cleaned.toLowerCase();
  const region = (rawRegion || 'Toshkent shahri').trim() || 'Toshkent shahri';
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  try {
    const current = getProductSearchLogs();
    // Agar oxirgi 15 soniya ichida xuddi shu so'rov shu foydalanuvchi tomonidan kiritilgan bo'lsa, 2 ta bo'lib ketmasligi uchun yangilaymiz
    if (current.length > 0) {
      const latest = current[0];
      const latestNorm = String(latest.normalizedTerm || latest.term || '').trim().toLowerCase();
      const latestMs = new Date(latest.createdAt || latest.timestamp || 0).getTime();
      const sameUser = (latest.userId || '') === (userId || '');
      if (latestNorm === normalizedTerm && sameUser && Math.abs(nowMs - latestMs) < 15000) {
        current[0] = {
          ...latest,
          term: formattedTerm,
          normalizedTerm,
          region,
          resultsCount: typeof resultsCount === 'number' ? resultsCount : latest.resultsCount,
        };
        localStorage.setItem(SEARCH_LOGS_KEY, JSON.stringify(current));
        window.dispatchEvent(new CustomEvent('bunkerstroy_search_updated'));
        return;
      }
    }

    const newEntry: ProductSearchQueryLog = {
      id: `sq-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      term: formattedTerm,
      normalizedTerm,
      region,
      userId,
      resultsCount,
      createdAt: nowIso,
      timestamp: nowIso,
    };
    const next = [newEntry, ...current].slice(0, 1000);
    localStorage.setItem(SEARCH_LOGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('bunkerstroy_search_updated'));
  } catch {}
};

// 2026-10-22T20:45:00.000Z — shu vaqtdan oldingi barcha eski buyurtma va statistikalar 0 holatiga keltirilgan
export const DEFAULT_STATS_RESET_CUTOFF_MS = 1761165900000;

export const getStatsResetCutoffMs = (): number => {
  try {
    const saved = Number(localStorage.getItem('bunkerstroy_stats_cutoff_ms')) || 0;
    return Math.max(DEFAULT_STATS_RESET_CUTOFF_MS, saved);
  } catch {
    return DEFAULT_STATS_RESET_CUTOFF_MS;
  }
};

export const isOrderAfterReset = (item: any): boolean => {
  if (!item) return false;
  const rawDate = item.createdAt || item.date || item.timestamp;
  if (!rawDate) return false;
  const t = new Date(rawDate).getTime();
  if (isNaN(t)) return false;
  return t >= getStatsResetCutoffMs();
};

// Faqat Onlayn Platformadan amalga oshirilgan savdolarni aniqlash (CRM Oflayn Savdo faqat ta'minotchi o'zi uchun ishlaydi)
export const isOnlinePlatformOrder = (order: any): boolean => {
  if (!order) return false;
  if (order.orderChannel === 'offline') return false;
  if (String(order.id || '').toUpperCase().startsWith('CRM-')) return false;
  const buyer = String(order.recipientName || order.buyerName || order.customerName || '').toLowerCase();
  const addr = String(order.deliveryAddress || '').toLowerCase();
  if (
    buyer.includes('oflayn xaridor') ||
    addr.includes('crm oflayn savdo') ||
    addr.includes('oflayn savdo')
  ) {
    return false;
  }
  return true;
};

const getOrderStatusRank = (status?: Order['status']): number => {
  switch (status) {
    case 'pending':
      return 1;
    case 'confirmed':
      return 2;
    case 'assigned':
      return 3;
    case 'in_transit':
      return 4;
    case 'delivered':
      return 5;
    case 'cancelled':
      return 6;
    default:
      return 0;
  }
};

const getPaymentStatusRank = (paymentStatus?: Order['paymentStatus'], requiresB2b?: boolean): number => {
  switch (paymentStatus) {
    case 'awaiting_b2b_approval':
      return 1;
    case 'b2b_approved_unpaid':
    case 'unpaid':
      return 2;
    case 'paid':
      return 3;
    default:
      return requiresB2b ? 1 : 3;
  }
};

export const pickMoreAdvancedOrder = (a: Order, b: Order): Order => {
  if (!a) return b;
  if (!b) return a;

  const aPayRank = getPaymentStatusRank(a.paymentStatus, a.requiresB2bApproval);
  const bPayRank = getPaymentStatusRank(b.paymentStatus, b.requiresB2bApproval);

  const aStatusRank = getOrderStatusRank(a.status);
  const bStatusRank = getOrderStatusRank(b.status);

  const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;

  const base = aTime >= bTime ? { ...b, ...a } : { ...a, ...b };

  const bestPaymentStatus = aPayRank >= bPayRank ? a.paymentStatus : b.paymentStatus;
  const bestStatus = aStatusRank >= bStatusRank ? a.status : b.status;
  const bestUpdatedAt =
    aTime >= bTime
      ? a.updatedAt || b.updatedAt || a.createdAt
      : b.updatedAt || a.updatedAt || b.createdAt;

  return {
    ...base,
    status: bestStatus || base.status || 'pending',
    paymentStatus: bestPaymentStatus || base.paymentStatus,
    paidAt: a.paidAt || b.paidAt,
    driverPhone: a.driverPhone || b.driverPhone,
    updatedAt: bestUpdatedAt,
  };
};

export const saveOrdersToStorageSafe = (ordersList: Order[]): void => {
  const serialized = JSON.stringify(ordersList);
  try {
    localStorage.setItem('bunkerstroy_orders', serialized);
  } catch {
    try {
      const savedLogs = localStorage.getItem('bunkerstroy_logs');
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        if (Array.isArray(parsedLogs) && parsedLogs.length > 20) {
          localStorage.setItem('bunkerstroy_logs', JSON.stringify(parsedLogs.slice(0, 20)));
        }
      }
      localStorage.removeItem('bunkerstroy_local_orders_v1');
      localStorage.setItem('bunkerstroy_orders', serialized);
    } catch {}
  }
};

const cleanName = (val?: string): string => {
  if (!val) return '';
  return val
    .toLowerCase()
    .replace(/[«»""''`‘’ʻʼ]/g, '')
    .replace(/mas\s*uliyati\s*cheklangan\s*jamiyati/gi, '')
    .replace(/\bmchj\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const toLocalYMD = (d: Date): string => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

export const getSupplierReport = (
  companyName: string,
  personName: string,
  region: string,
  phone: string,
  contractNum: string,
  commissionRate: number = 5,
  commissionBasis: CommissionBasis = 'total',
  period: SupplierReportPeriod = 'all',
  selectedDateStr?: string,
  supplierId?: string,
  supplierInn?: string,
  onlyOnline: boolean = false
): SupplierDetailedReport => {
  const sales: SupplierSaleItem[] = [];
  const returns: SupplierReturnItem[] = [];
  const routes: SupplierLogisticsRoute[] = [];

  const validCommission = Math.min(100, Math.max(0.1, Number(commissionRate) || 0.1));
  const validBasis: CommissionBasis = commissionBasis === 'profit' ? 'profit' : 'total';

  const now = new Date();
  const targetIso = selectedDateStr || toLocalYMD(now); // YYYY-MM-DD
  const targetDayPrefix = targetIso.slice(0, 10); // YYYY-MM-DD
  const targetMonthPrefix = targetIso.slice(0, 7); // YYYY-MM
  const targetYearPrefix = targetIso.slice(0, 4); // YYYY

  const matchesPeriod = (isoOrDateStr?: string): boolean => {
    if (period === 'all') return true;
    if (!isoOrDateStr) return true;
    let utcFormatted = '';
    let localFormatted = '';
    try {
      const d = new Date(isoOrDateStr);
      if (!isNaN(d.getTime())) {
        utcFormatted = d.toISOString().slice(0, 10);
        localFormatted = toLocalYMD(d);
      } else {
        utcFormatted = String(isoOrDateStr).slice(0, 10);
        localFormatted = utcFormatted;
      }
    } catch {
      utcFormatted = String(isoOrDateStr).slice(0, 10);
      localFormatted = utcFormatted;
    }
    if (period === 'day') {
      return utcFormatted.startsWith(targetDayPrefix) || localFormatted.startsWith(targetDayPrefix);
    }
    if (period === 'month') {
      return utcFormatted.startsWith(targetMonthPrefix) || localFormatted.startsWith(targetMonthPrefix);
    }
    if (period === 'year') {
      return utcFormatted.startsWith(targetYearPrefix) || localFormatted.startsWith(targetYearPrefix);
    }
    return true;
  };

  try {
    const savedOrders = localStorage.getItem('bunkerstroy_orders');
    const rawOrders: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
    const orders: Order[] = Array.isArray(rawOrders)
      ? rawOrders.filter((o) => isOrderAfterReset(o) && (!onlyOnline || isOnlinePlatformOrder(o)))
      : [];
    const savedProducts = localStorage.getItem('bunkerstroy_products');
    const products: Product[] = savedProducts ? JSON.parse(savedProducts) : [];
    const savedSuppliers = localStorage.getItem('bunkerstroy_suppliers');
    const suppliersList: SupplierPartner[] = savedSuppliers ? JSON.parse(savedSuppliers) : [];

    const normalizedComp = cleanName(companyName);
    const fullLowerComp = (companyName || '').trim().toLowerCase();

    // Find supplier record in bunkerstroy_suppliers with strict priority on supplierId so B2B and B2C cabinets of the same company/STIR never mix
    const matchedSupplierRecord = Array.isArray(suppliersList)
      ? (supplierId ? suppliersList.find((s) => s && s.id === supplierId) : undefined) ||
        (supplierInn ? suppliersList.find((s) => s && s.inn && s.inn === supplierInn) : undefined) ||
        suppliersList.find(
          (s) =>
            s &&
            (cleanName(s.companyName) === normalizedComp ||
              (s.companyName || '').trim().toLowerCase() === fullLowerComp)
        )
      : undefined;

    const effSuppId = supplierId || matchedSupplierRecord?.id || '';
    const effSuppInn = (supplierInn || matchedSupplierRecord?.inn || '').trim();
    const effCabinetType = matchedSupplierRecord?.cabinetType;
    const hasAnotherCabinetForSameCompany = Array.isArray(suppliersList)
      ? suppliersList.some(
          (s) =>
            s &&
            s.id !== effSuppId &&
            ((effSuppInn && s.inn && s.inn === effSuppInn) ||
              (normalizedComp && cleanName(s.companyName) === normalizedComp))
        )
      : false;

    const aliasNames = new Set<string>(
      [
        normalizedComp,
        fullLowerComp,
        cleanName(matchedSupplierRecord?.companyName),
        cleanName(matchedSupplierRecord?.companyInfo?.companyName),
        cleanName(matchedSupplierRecord?.companyInfo?.shortName),
      ].filter(Boolean)
    );
    // Built-in STIR 313086503 bilingual aliases (Uzbek & English registry names)
    if (
      effSuppInn === '313086503' ||
      normalizedComp.includes('national ai technology') ||
      normalizedComp.includes('insonlar uchun milliy ai')
    ) {
      aliasNames.add('national ai technology for humans');
      aliasNames.add('insonlar uchun milliy ai texnologiyasi');
      aliasNames.add('insonlar uchun milliy ai technology');
    }

    const otherSuppliersCleanNames = new Set<string>(
      (Array.isArray(suppliersList) ? suppliersList : [])
        .filter((s) => s.id !== effSuppId && cleanName(s.companyName) !== normalizedComp)
        .map((s) => cleanName(s.companyName))
        .filter(Boolean)
    );

    const doesItemBelongToSupplier = (item: any, matchedProd?: Product): boolean => {
      const itemSuppId = item?.supplierId || matchedProd?.supplierId || '';
      if (effSuppId && itemSuppId) {
        return itemSuppId === effSuppId;
      }
      if (
        effCabinetType &&
        matchedProd?.supplierCabinetType &&
        matchedProd.supplierCabinetType !== effCabinetType
      ) {
        return false;
      }
      // Agar bir korxonaning ham B2B, ham B2C kabineti bo'lsa, supplierId si boshqa kabinetga tegishli savdolarni aralashtirmaymiz
      if (hasAnotherCabinetForSameCompany && effSuppId && !itemSuppId) {
        return false;
      }
      if (effSuppInn && (item.supplierInn === effSuppInn || matchedProd?.supplierInn === effSuppInn)) {
        return true;
      }
      const rawSupplierName =
        item.supplierName ||
        item?.product?.supplierName ||
        matchedProd?.supplierName ||
        '';
      const itemSuppFull = rawSupplierName.trim().toLowerCase();
      const itemSuppClean = cleanName(rawSupplierName);

      if (itemSuppClean || itemSuppFull) {
        for (const alias of aliasNames) {
          if (
            alias &&
            (itemSuppClean === alias ||
              itemSuppFull === alias ||
              (alias.length >= 3 && itemSuppClean.includes(alias)) ||
              (itemSuppClean.length >= 3 && alias.includes(itemSuppClean)))
          ) {
            return true;
          }
        }
      }

      // Agar tizimda faqat 1 ta ta'minotchi bo'lsa yoki mahsulot eski nomda qolgan bo'lsa va boshqa ta'minotchiga tegishli bo'lmasa
      if (
        Array.isArray(suppliersList) &&
        suppliersList.length === 1 &&
        !otherSuppliersCleanNames.has(itemSuppClean)
      ) {
        return true;
      }

      return false;
    };

    if (Array.isArray(orders) && (normalizedComp || effSuppId || effSuppInn)) {
      orders.forEach((order) => {
        if (!order || !Array.isArray(order.items)) return;
        if (!matchesPeriod(order.createdAt)) return;

        order.items.forEach((item: any, idx: number) => {
          const matchedProd = Array.isArray(products)
            ? products.find(
                (p) =>
                  p &&
                  (p.id === (item.productId || item?.product?.id) ||
                    (p.title &&
                      (item.title || item?.product?.title) &&
                      p.title.trim().toLowerCase() ===
                        String(item.title || item?.product?.title).trim().toLowerCase()))
              )
            : undefined;

          if (doesItemBelongToSupplier(item, matchedProd)) {
            const title =
              item.title ||
              item?.product?.title ||
              item?.product?.name ||
              matchedProd?.title ||
              'Mahsulot';
            const category =
              item.category ||
              item?.product?.category ||
              matchedProd?.category ||
              'Qurilish mollari';
            const unit =
              item.unit ||
              item?.product?.unit ||
              matchedProd?.unit ||
              'dona';
            const price =
              Number(item.price) ||
              Number(item?.product?.price) ||
              Number(matchedProd?.price) ||
              0;
            const quantity = Number(item.quantity) || 0;
            const totalSum =
              typeof item.totalSum === 'number' && !isNaN(item.totalSum)
                ? Math.max(0, Number(item.totalSum))
                : price * quantity;

            // Mahsulot sotuvidan qolgan foyda hisobi (agar tannarx kiritilgan bo'lsa farqi, aks holda savdo foydasi 20%)
            const costPricePerUnit =
              Number(item.costPrice) ||
              Number((matchedProd as any)?.costPrice) ||
              Number(matchedProd?.originalPrice && matchedProd.originalPrice < price ? matchedProd.originalPrice : 0) ||
              Math.round(price * 0.8);
            const unitProfit = Math.max(0, price - costPricePerUnit) || Math.round(price * 0.2);
            const profitSum = Math.min(totalSum, unitProfit * quantity);

            const dateStr = order.createdAt
              ? new Date(order.createdAt).toISOString().replace('T', ' ').slice(0, 16)
              : '';
            const buyerName =
              order.recipientName ||
              order.buyerName ||
              (order as any).customerName ||
              'Xaridor';
            const buyerPhone =
              order.recipientPhone ||
              order.buyerPhone ||
              (order as any).customerPhone ||
              '';
            const driverPhone = order.driverPhone || '';

            if (order.status === 'cancelled' || (order.status as string) === 'returned') {
              returns.push({
                id: `ret-${order.id}-${idx}`,
                productTitle: title,
                quantity,
                unit,
                totalSum,
                reason: 'Buyurtma bekor qilindi yoki qaytarildi',
                date: dateStr,
                status: 'returned',
              });
            } else {
              const saleStatus: SupplierSaleItem['status'] =
                order.status === 'delivered'
                  ? 'delivered'
                  : order.status === 'in_transit'
                  ? 'in_transit'
                  : order.status === 'assigned'
                  ? 'assigned'
                  : 'pending';

              const resolvedChannel: 'online' | 'offline' = isOnlinePlatformOrder(order)
                ? 'online'
                : 'offline';

              sales.push({
                id: `sale-${order.id}-${idx}`,
                orderId: order.id,
                productId: item.productId || item?.product?.id || matchedProd?.id,
                orderChannel: resolvedChannel,
                productTitle: title,
                category,
                quantity,
                unit,
                price,
                totalSum,
                profitSum,
                buyerName,
                buyerPhone,
                driverPhone,
                deliveryAddress: order.deliveryAddress || 'Xaridor manzili',
                date: dateStr,
                rawDate: order.createdAt,
                status: saleStatus,
              });

              routes.push({
                id: `rt-${order.id}-${idx}`,
                fromLocation: `${region}, ${companyName} ombori`,
                toLocation: order.deliveryAddress || 'Xaridor manzili',
                productTitle: `${title} - ${quantity} ${unit}`,
                quantityText: `${quantity} ${unit}`,
                driverName: order.driverName || 'Yetkazib beruvchi',
                driverPhone: driverPhone || phone || buyerPhone,
                vehicle: order.vehicleType || 'Maxsus yuk transporti',
                status: saleStatus,
                deliveredAt: dateStr,
              });
            }
          }
        });
      });
    }
  } catch {}

  const totalSalesSum = sales.reduce((acc, s) => acc + (Number(s.totalSum) || 0), 0);
  const totalProfitSum = sales.reduce((acc, s) => acc + (Number(s.profitSum) || Math.round((Number(s.totalSum) || 0) * 0.2)), 0);
  const totalSoldQuantity = sales.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
  const uniqueProductTypesCount = new Set(
    sales.map((s) => (s.productTitle || '').trim().toLowerCase()).filter(Boolean)
  ).size;

  // DIQQAT: CRM da olib borilgan oflayn savdolar Admin hisob-kitobi va Bunker Stroy ulushi emas!
  // Bunker Stroy ulushi faqatgina Onlayn platformadagi savdolardan ajratiladi:
  const onlineSalesForCommission = sales.filter((s) => s.orderChannel !== 'offline');
  const onlineSalesSum = onlineSalesForCommission.reduce((acc, s) => acc + (Number(s.totalSum) || 0), 0);
  const onlineProfitSum = onlineSalesForCommission.reduce(
    (acc, s) => acc + (Number(s.profitSum) || Math.round((Number(s.totalSum) || 0) * 0.2)),
    0
  );

  // Umumiydan deganda Mahsulotning umumiy narxidan, Savdodan deganda Mahsulot sotuvidan qolgan foydadan hisoblanadi
  const baseSumForCommission = validBasis === 'profit' ? onlineProfitSum : onlineSalesSum;
  const totalCommissionSum = Math.round((baseSumForCommission * validCommission) / 100);
  const netPayoutSum = Math.max(0, totalSalesSum - totalCommissionSum);

  return {
    supplierId: supplierId || (companyName || 'supplier').toLowerCase().replace(/\s+/g, '_'),
    companyName: companyName,
    responsiblePerson: personName,
    phone: phone,
    region: region,
    contractNumber: contractNum || 'Shartnoma kiritilmagan',
    commissionRate: validCommission,
    commissionBasis: validBasis,
    totalSalesSum,
    totalProfitSum,
    totalCommissionSum,
    netPayoutSum,
    totalSoldQuantity,
    uniqueProductTypesCount,
    sales,
    returns,
    routes,
  };
};


