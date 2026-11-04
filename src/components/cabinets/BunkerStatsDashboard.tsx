import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  BarChart3,
  MapPin,
  Calendar,
  Users,
  PieChart,
  Building2,
  Store,
  X,
} from 'lucide-react';
import { Product, Order, SupplierPartner, UserProfile } from '../../types';
import { FinancialTransaction } from '../../data/bunkerFinanceData';
import {
  MOCK_FAKE_PRODUCT_IDS,
  MOCK_FAKE_SUPPLIER_IDS,
} from '../../data/mockData';
import { isOrderAfterReset, isOnlinePlatformOrder } from '../../data/supplierReportsData';

interface BunkerStatsDashboardProps {
  onNavigateToCatalog: () => void;
  onNavigateToLogistics: () => void;
  onNavigateToGlobal: () => void;
  onNavigateToAdmin?: () => void;
  onOpenCart?: () => void;
  onOpenAuth?: () => void;
  cartCount?: number;
}

type PeriodFilter = 'day' | 'week' | 'month' | 'range' | null;

const UZBEKISTAN_REGIONS = [
  { key: 'Toshkent shahri', match: ['toshkent sh', 'tashkent city', 'toshkent shahri'], color: 'bg-[#FFB800]', hex: '#FFB800' },
  { key: 'Toshkent viloyati', match: ['toshkent vil', 'chirchiq', 'olmaliq', 'angren', 'bekobod', 'qibray', 'zangiota'], color: 'bg-blue-500', hex: '#3B82F6' },
  { key: 'Samarqand viloyati', match: ['samarqand', 'urgut', 'kattaqo'], color: 'bg-emerald-500', hex: '#10B981' },
  { key: 'Farg‘ona viloyati', match: ['farg', 'qo‘qon', 'qoqon', 'marg‘ilon', 'margilon'], color: 'bg-amber-400', hex: '#FBBF24' },
  { key: 'Andijon viloyati', match: ['andijon', 'asaka', 'shahrixon'], color: 'bg-purple-500', hex: '#A855F7' },
  { key: 'Namangan viloyati', match: ['namangan', 'chust', 'pop'], color: 'bg-cyan-400', hex: '#22D3EE' },
  { key: 'Buxoro viloyati', match: ['buxoro', 'g‘ijduvon', 'kogon'], color: 'bg-rose-500', hex: '#F43F5E' },
  { key: 'Qashqadaryo viloyati', match: ['qashqadaryo', 'qarshi', 'shahrisabz'], color: 'bg-indigo-400', hex: '#818CF8' },
  { key: 'Surxondaryo viloyati', match: ['surxondaryo', 'termiz', 'denov'], color: 'bg-teal-400', hex: '#2DD4BF' },
  { key: 'Navoiy viloyati', match: ['navoiy', 'zarafshon', 'karmana'], color: 'bg-orange-400', hex: '#FB923C' },
  { key: 'Jizzax viloyati', match: ['jizzax', 'zomin'], color: 'bg-lime-400', hex: '#A3E635' },
  { key: 'Sirdaryo viloyati', match: ['sirdaryo', 'guliston', 'yangiyer'], color: 'bg-pink-400', hex: '#F472B6' },
  { key: 'Xorazm viloyati', match: ['xorazm', 'urganch', 'xiva'], color: 'bg-sky-400', hex: '#38BDF8' },
  { key: 'Qoraqalpog‘iston Resp.', match: ['qoraqalpog', 'nukus', 'qo‘ng‘irot', 'beruniy'], color: 'bg-violet-400', hex: '#A78BFA' },
];

const cleanCompanyName = (val?: string): string => {
  if (!val) return '';
  return val
    .toLowerCase()
    .replace(/[«»""''`‘’ʻʼ]/g, '')
    .replace(/mas\s*uliyati\s*cheklangan\s*jamiyati/gi, '')
    .replace(/\bmchj\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Helper to match region string to one of the 14 Uzbekistan regions
const resolveRegionKey = (rawRegion?: string, rawExtra?: string): string | null => {
  const combined = `${rawRegion || ''} ${rawExtra || ''}`.toLowerCase().trim();
  if (!combined) return null;

  for (const reg of UZBEKISTAN_REGIONS) {
    if (reg.key.toLowerCase() === (rawRegion || '').toLowerCase().trim()) {
      return reg.key;
    }
    if (reg.match.some((kw) => combined.includes(kw))) {
      return reg.key;
    }
  }
  return null;
};

export const BunkerStatsDashboard: React.FC<BunkerStatsDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>(null);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [activeBarHover, setActiveBarHover] = useState<number | null>(null);

  // Real data states synchronized from localStorage & events
  const [orders, setOrders] = useState<Order[]>([]);
  const [b2bOrders, setB2bOrders] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierPartner[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);

  const loadRealData = () => {
    try {
      const savedOrders = localStorage.getItem('bunkerstroy_orders');
      const parsedOrders: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
      setOrders(
        Array.isArray(parsedOrders)
          ? parsedOrders.filter((o) => isOrderAfterReset(o) && isOnlinePlatformOrder(o))
          : []
      );
    } catch {
      setOrders([]);
    }

    try {
      const savedB2b = localStorage.getItem('bunkerstroy_b2b_orders');
      const parsedB2b: any[] = savedB2b ? JSON.parse(savedB2b) : [];
      setB2bOrders(Array.isArray(parsedB2b) ? parsedB2b : []);
    } catch {
      setB2bOrders([]);
    }

    try {
      const savedTx = localStorage.getItem('bunkerstroy_transactions');
      const parsedTx: FinancialTransaction[] = savedTx ? JSON.parse(savedTx) : [];
      setTransactions(Array.isArray(parsedTx) ? parsedTx.filter((tx) => isOrderAfterReset(tx)) : []);
    } catch {
      setTransactions([]);
    }

    try {
      const savedProd = localStorage.getItem('bunkerstroy_products');
      const parsedProd: Product[] = savedProd ? JSON.parse(savedProd) : [];
      setProducts(
        Array.isArray(parsedProd)
          ? parsedProd.filter((p) => p && p.id && !MOCK_FAKE_PRODUCT_IDS.includes(p.id))
          : []
      );
    } catch {
      setProducts([]);
    }

    try {
      const savedSupp = localStorage.getItem('bunkerstroy_suppliers');
      const parsedSupp: SupplierPartner[] = savedSupp ? JSON.parse(savedSupp) : [];
      setSuppliers(
        Array.isArray(parsedSupp)
          ? parsedSupp.filter(
              (s) =>
                s &&
                s.id &&
                s.id.startsWith('supp-') &&
                !MOCK_FAKE_SUPPLIER_IDS.includes(s.id) &&
                s.companyName !== 'NATH'
            )
          : []
      );
    } catch {
      setSuppliers([]);
    }

    try {
      const savedCust = localStorage.getItem('bunkerstroy_customers');
      const parsedCust: UserProfile[] = savedCust ? JSON.parse(savedCust) : [];
      const seenKeys = new Set<string>();
      const validCusts: UserProfile[] = [];
      if (Array.isArray(parsedCust)) {
        parsedCust.forEach((u) => {
          if (!u || !u.id || u.role === 'admin' || u.role === 'supplier') return;
          const rawName = (u.displayName || `${u.firstName || ''} ${u.lastName || ''}` || u.login || '').trim().toLowerCase();
          if (
            rawName === 'adminstrator' ||
            rawName === 'administrator' ||
            rawName === 'superadmin' ||
            rawName === 'bosh admin'
          ) {
            return;
          }
          const phoneDigits = (u.phone || '').replace(/\D/g, '').slice(-9);
          const uniqueKey = phoneDigits ? `tel:${phoneDigits}` : `name:${rawName || u.id}`;
          if (seenKeys.has(uniqueKey)) return;
          seenKeys.add(uniqueKey);
          validCusts.push(u);
        });
      }
      setCustomers(validCusts);
    } catch {
      setCustomers([]);
    }
  };

  useEffect(() => {
    loadRealData();
    window.addEventListener('bunkerstroy_finance_updated', loadRealData);
    window.addEventListener('bunkerstroy_suppliers_updated', loadRealData);
    window.addEventListener('bunkerstroy_b2b_orders_updated', loadRealData);
    window.addEventListener('storage', loadRealData);
    const interval = setInterval(loadRealData, 2500);
    return () => {
      window.removeEventListener('bunkerstroy_finance_updated', loadRealData);
      window.removeEventListener('bunkerstroy_suppliers_updated', loadRealData);
      window.removeEventListener('bunkerstroy_b2b_orders_updated', loadRealData);
      window.removeEventListener('storage', loadRealData);
      clearInterval(interval);
    };
  }, []);

  const formatSum = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(Math.round(n))} so‘m`;

  // Filter orders, B2B orders, and transactions by selected period (null = Umumiy barchasini ko'rsatadi)
  const { filteredOrders, filteredB2bOrders, filteredTx } = useMemo(() => {
    if (!selectedPeriod) {
      return {
        filteredOrders: orders,
        filteredB2bOrders: b2bOrders,
        filteredTx: transactions,
      };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);
    const rangeStart =
      startParts.length === 3
        ? new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0).getTime()
        : new Date(startDate).getTime() || 0;
    const rangeEnd =
      endParts.length === 3
        ? new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999).getTime()
        : (new Date(endDate).getTime() || Date.now()) + 24 * 60 * 60 * 1000 - 1;

    const inPeriod = (dateStr?: string) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      if (isNaN(t)) return false;
      if (selectedPeriod === 'day') return t >= startOfToday && t <= endOfToday;
      if (selectedPeriod === 'week') return t >= weekAgo && t <= endOfToday;
      if (selectedPeriod === 'month') return t >= monthAgo && t <= endOfToday;
      if (selectedPeriod === 'range') return t >= rangeStart && t <= rangeEnd;
      return true;
    };

    return {
      filteredOrders: orders.filter((o) => inPeriod(o.createdAt)),
      filteredB2bOrders: b2bOrders.filter((bo) => inPeriod(bo.createdAt)),
      filteredTx: transactions.filter((tx) => inPeriod(tx.date)),
    };
  }, [orders, b2bOrders, transactions, selectedPeriod, startDate, endDate]);

  // Helper to check if an order item belongs to a specific supplier (supports STIR, ID, and bilingual company aliases)
  const doesOrderItemBelongToSupplier = (
    item: any,
    matchedProd: Product | undefined,
    supplier: SupplierPartner,
    allSuppliers: SupplierPartner[]
  ): boolean => {
    if (supplier.id && (item.supplierId === supplier.id || matchedProd?.supplierId === supplier.id)) {
      return true;
    }
    const suppInn = (supplier.inn || '').trim();
    if (suppInn && (item.supplierInn === suppInn || matchedProd?.supplierInn === suppInn)) {
      return true;
    }

    const normalizedComp = cleanCompanyName(supplier.companyName);
    const fullLowerComp = (supplier.companyName || '').trim().toLowerCase();
    const aliasNames = new Set<string>(
      [
        normalizedComp,
        fullLowerComp,
        cleanCompanyName(supplier.companyInfo?.companyName),
        cleanCompanyName(supplier.companyInfo?.shortName),
      ].filter(Boolean)
    );

    if (
      suppInn === '313086503' ||
      normalizedComp.includes('national ai technology') ||
      normalizedComp.includes('insonlar uchun milliy ai')
    ) {
      aliasNames.add('national ai technology for humans');
      aliasNames.add('insonlar uchun milliy ai texnologiyasi');
      aliasNames.add('insonlar uchun milliy ai technology');
    }

    const rawSupplierName =
      item.supplierName ||
      item?.product?.supplierName ||
      matchedProd?.supplierName ||
      '';
    const itemSuppFull = rawSupplierName.trim().toLowerCase();
    const itemSuppClean = cleanCompanyName(rawSupplierName);

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

    const otherSuppliersCleanNames = new Set<string>(
      allSuppliers
        .filter((s) => s.id !== supplier.id && cleanCompanyName(s.companyName) !== normalizedComp)
        .map((s) => cleanCompanyName(s.companyName))
        .filter(Boolean)
    );

    if (allSuppliers.length === 1 && !otherSuppliersCleanNames.has(itemSuppClean)) {
      return true;
    }

    return false;
  };

  // 1. KABINETLAR SONI, TA'MINOTCHILAR ULUSHI, BUNKER STROY ULUSHI VA HAR BIR KABINETNING SAVDO AYLANMASI
  const supplierSalesStats = useMemo(() => {
    const activeOrders = filteredOrders.filter((o) => o.status !== 'cancelled');
    const activeB2bOrders = filteredB2bOrders.filter((bo) => bo.status !== 'cancelled');
    const isAllTime = selectedPeriod === null;

    const suppliersRecordedSum =
      isAllTime && activeOrders.length > 0
        ? suppliers.reduce((sum, s) => sum + (Number(s.totalSalesSum) || 0), 0)
        : 0;
    const periodOrdersSum = activeOrders.reduce(
      (sum, o) => sum + (Number(o.totalAmount) || 0),
      0
    );
    const periodB2bOrdersSum = activeB2bOrders.reduce(
      (sum, bo) => sum + (Number(bo.totalAmount) || 0),
      0
    );
    const txIncomeSum = filteredTx
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const palette = [
      { color: 'bg-[#FFB800]', hex: '#FFB800' },
      { color: 'bg-emerald-500', hex: '#10B981' },
      { color: 'bg-blue-500', hex: '#3B82F6' },
      { color: 'bg-purple-500', hex: '#A855F7' },
      { color: 'bg-rose-500', hex: '#F43F5E' },
      { color: 'bg-cyan-400', hex: '#22D3EE' },
    ];

    const supplierBreakdown = suppliers.map((s, idx) => {
      const commissionRate = Math.min(100, Math.max(0.1, Number(s.commissionRate) || 1));
      const orderSumForSupp = activeOrders.reduce((acc, o) => {
        const itemsSum = (o.items || []).reduce((iAcc, item) => {
          const matchedProd = products.find(
            (p) =>
              p.id === item.productId ||
              (p.title && item.title && p.title.trim().toLowerCase() === item.title.trim().toLowerCase())
          );
          if (doesOrderItemBelongToSupplier(item, matchedProd, s, suppliers)) {
            return iAcc + (Number(item.price) || 0) * (Number(item.quantity) || 0);
          }
          return iAcc;
        }, 0);
        return acc + itemsSum;
      }, 0);

      // Also include B2B orders where this supplier is the manufacturer
      const b2bSumForSupp = activeB2bOrders.reduce((acc, bo) => {
        const normManufacturer = cleanCompanyName(bo.manufacturerCompanyName);
        const normSupp = cleanCompanyName(s.companyName);
        if (
          (bo.manufacturerId && bo.manufacturerId === s.id) ||
          (normManufacturer && normSupp && (normManufacturer === normSupp || normManufacturer.includes(normSupp) || normSupp.includes(normManufacturer)))
        ) {
          return acc + (Number(bo.totalAmount) || 0);
        }
        return acc;
      }, 0);

      const totalOrderSumForSupp = orderSumForSupp + b2bSumForSupp;

      const grossAmount =
        isAllTime && (activeOrders.length > 0 || activeB2bOrders.length > 0)
          ? Math.max(Number(s.totalSalesSum) || 0, totalOrderSumForSupp)
          : totalOrderSumForSupp;

      const bunkerProfitUzs = Math.round((grossAmount * commissionRate) / 100);
      const netTransferredUzs = Math.max(0, grossAmount - bunkerProfitUzs);
      const pal = palette[idx % palette.length];

      return {
        id: s.id,
        companyName: s.companyName,
        inn: s.inn || '',
        region: s.region || '',
        cabinetType: s.cabinetType === 'manufacturer' ? ('B2B' as const) : ('B2C' as const),
        commissionRate,
        amountUzs: grossAmount,
        netTransferredUzs,
        bunkerProfitUzs,
        color: pal.color,
        hex: pal.hex,
      };
    });

    let unmatchedOrdersSum = 0;
    activeOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const lineSum = (Number(item.price) || 0) * (Number(item.quantity) || 0);
        const matchedProd = products.find(
          (p) =>
            p.id === item.productId ||
            (p.title && item.title && p.title.trim().toLowerCase() === item.title.trim().toLowerCase())
        );
        const foundSupp = suppliers.some((s) =>
          doesOrderItemBelongToSupplier(item, matchedProd, s, suppliers)
        );
        if (!foundSupp) {
          unmatchedOrdersSum += lineSum;
        }
      });
    });

    const sumFromSuppliersGross = supplierBreakdown.reduce((acc, b) => acc + b.amountUzs, 0);
    const totalTransferredUzs = Math.max(
      sumFromSuppliersGross + unmatchedOrdersSum,
      suppliersRecordedSum,
      periodOrdersSum + periodB2bOrdersSum,
      txIncomeSum
    );

    const suppliersCount = suppliers.length;
    const totalPoolCapacity = suppliersCount > 0 ? suppliersCount * 100 : 100;
    const sumCommissionRates =
      suppliersCount > 0
        ? suppliers.reduce((acc, s) => acc + Math.min(100, Math.max(0.1, Number(s.commissionRate) || 1)), 0)
        : 0;
    const normalizedBunkerPct =
      totalTransferredUzs > 0
        ? suppliersCount > 0
          ? Number(((sumCommissionRates / totalPoolCapacity) * 100).toFixed(1))
          : 1
        : 0;

    const matchedSalesSum = supplierBreakdown.reduce((acc, b) => acc + b.amountUzs, 0);
    const matchedProfitSum = supplierBreakdown.reduce((acc, b) => acc + b.bunkerProfitUzs, 0);
    const remainingSalesUzs = Math.max(0, totalTransferredUzs - matchedSalesSum);
    const remainingProfitUzs = Math.round((remainingSalesUzs * (normalizedBunkerPct || 1)) / 100);
    const totalBunkerProfitUzs = totalTransferredUzs > 0 ? matchedProfitSum + remainingProfitUzs : 0;

    const rawBunkerPct =
      totalTransferredUzs > 0
        ? matchedSalesSum > 0
          ? (totalBunkerProfitUzs / totalTransferredUzs) * 100
          : normalizedBunkerPct
        : 0;

    const effectiveBunkerPct =
      totalTransferredUzs > 0
        ? Number.isInteger(Number(rawBunkerPct.toFixed(1)))
          ? Math.round(rawBunkerPct)
          : Number(rawBunkerPct.toFixed(1))
        : 0;
    const effectiveSupplierPct =
      totalTransferredUzs > 0
        ? Number((100 - effectiveBunkerPct).toFixed(1))
        : 0;

    const maxSuppAmount = Math.max(...supplierBreakdown.map((b) => b.amountUzs), 1);

    const b2bCabinets = supplierBreakdown.filter((b) => b.cabinetType === 'B2B');
    const b2cCabinets = supplierBreakdown.filter((b) => b.cabinetType === 'B2C');

    const b2bTurnoverUzs = b2bCabinets.reduce((s, b) => s + b.amountUzs, 0);
    const b2bBunkerProfitUzs = b2bCabinets.reduce((s, b) => s + b.bunkerProfitUzs, 0);
    const b2bSupplierNetUzs = Math.max(0, b2bTurnoverUzs - b2bBunkerProfitUzs);

    const b2cTurnoverUzs = b2cCabinets.reduce((s, b) => s + b.amountUzs, 0);
    const b2cBunkerProfitUzs = b2cCabinets.reduce((s, b) => s + b.bunkerProfitUzs, 0);
    const b2cSupplierNetUzs = Math.max(0, b2cTurnoverUzs - b2cBunkerProfitUzs);

    // Foydalanuvchi (Mijoz) kabinetlar savdo aylanmasi
    const customerBreakdown = customers.map((c) => {
      const custPhone = (c.phone || '').replace(/\D/g, '').slice(-9);
      const custName = (c.displayName || `${c.firstName || ''} ${c.lastName || ''}`).trim().toLowerCase();
      const custOrders = activeOrders.filter((o) => {
        if (o.buyerId && o.buyerId === c.id) return true;
        const oPhone = (o.buyerPhone || (o as any).recipientPhone || '').replace(/\D/g, '').slice(-9);
        if (custPhone && oPhone && custPhone === oPhone) return true;
        const oName = (o.buyerName || (o as any).recipientName || '').trim().toLowerCase();
        if (custName && oName && custName === oName) return true;
        return false;
      });
      const turnoverUzs = custOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
      return {
        id: c.id,
        name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Mijoz',
        phone: c.phone || '—',
        region: c.region || '—',
        ordersCount: custOrders.length,
        amountUzs: turnoverUzs,
      };
    });

    const customerTotalTurnoverUzs = Math.max(
      periodOrdersSum,
      customerBreakdown.reduce((s, c) => s + c.amountUzs, 0)
    );

    return {
      totalTransferredUzs,
      totalBunkerProfitUzs,
      bunkerSharePct: effectiveBunkerPct,
      supplierSharePct: effectiveSupplierPct,
      validOrdersCount: activeOrders.length + activeB2bOrders.length,
      b2bCabinetsCount: b2bCabinets.length,
      b2cCabinetsCount: b2cCabinets.length,
      customerCabinetsCount: customers.length,
      b2bTurnoverUzs,
      b2bSupplierNetUzs,
      b2bBunkerProfitUzs,
      b2cTurnoverUzs,
      b2cSupplierNetUzs,
      b2cBunkerProfitUzs,
      customerTotalTurnoverUzs,
      supplierBreakdown: supplierBreakdown.map((b) => ({
        ...b,
        pct: totalTransferredUzs > 0 ? Math.round((b.amountUzs / totalTransferredUzs) * 100) : 0,
        barHeightPct: b.amountUzs > 0 ? Math.max(12, Math.round((b.amountUzs / maxSuppAmount) * 100)) : 0,
      })),
      customerBreakdown,
    };
  }, [filteredOrders, filteredB2bOrders, filteredTx, suppliers, products, customers, selectedPeriod]);

  // 2. 12 OYLIK SAVDO VA TALAB DINAMIKASI (YAN — DEK, VAQT FILTRI BILAN UMUMIYDA ISHLAYDI)
  const monthlyData = useMemo(() => {
    const monthNames = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const currentYear = new Date().getFullYear();

    const months12 = monthNames.map((m, idx) => ({
      month: m,
      monthIdx: idx,
      year: currentYear,
      sum: 0,
      demandOrdersCount: 0,
    }));

    filteredOrders.forEach((o) => {
      if (o.status === 'cancelled' || !o.createdAt) return;
      const d = new Date(o.createdAt);
      if (isNaN(d.getTime())) return;
      const bucket = months12[d.getMonth()];
      if (bucket) {
        bucket.sum += Number(o.totalAmount) || 0;
        bucket.demandOrdersCount += 1;
      }
    });

    filteredB2bOrders.forEach((bo) => {
      if (bo.status === 'cancelled' || !bo.createdAt) return;
      const d = new Date(bo.createdAt);
      if (isNaN(d.getTime())) return;
      const bucket = months12[d.getMonth()];
      if (bucket) {
        bucket.sum += Number(bo.totalAmount) || 0;
        bucket.demandOrdersCount += 1;
      }
    });

    const maxSum = Math.max(...months12.map((b) => b.sum), 0);
    const maxDemand = Math.max(...months12.map((b) => b.demandOrdersCount), 0);

    return months12.map((b) => ({
      month: b.month,
      val: b.sum,
      demandCount: b.demandOrdersCount,
      displayUzs:
        b.sum >= 1_000_000
          ? `${(b.sum / 1_000_000).toFixed(1)}m`
          : `${new Intl.NumberFormat('uz-UZ').format(b.sum)}`,
      full: formatSum(b.sum),
      salesPct: maxSum > 0 ? Math.max(10, Math.round((b.sum / maxSum) * 100)) : 0,
      demandPct: maxDemand > 0 ? Math.max(10, Math.round((b.demandOrdersCount / maxDemand) * 100)) : 0,
    }));
  }, [filteredOrders, filteredB2bOrders]);

  const total12MonthsTurnover = useMemo(
    () => monthlyData.reduce((acc, m) => acc + m.val, 0),
    [monthlyData]
  );

  const total12MonthsDemand = useMemo(
    () => monthlyData.reduce((acc, m) => acc + m.demandCount, 0),
    [monthlyData]
  );

  // 3. HUDUDLAR MIQYOSIDA KABINETLAR DIAGRAMMASI (14 TA HUDUD: B2B, B2C, FOYDALANUVCHI KABINETLAR SONI VA SAVDO AYLANMASI)
  const regionalDemands = useMemo(() => {
    const validOrders = filteredOrders.filter((o) => o.status !== 'cancelled');
    const validB2bOrders = filteredB2bOrders.filter((bo) => bo.status !== 'cancelled');

    const regMap: Record<
      string,
      {
        ordersCount: number;
        salesUzs: number;
        itemsQty: number;
        b2bCount: number;
        b2cCount: number;
        suppliersCount: number;
        customersCount: number;
      }
    > = {};

    UZBEKISTAN_REGIONS.forEach((r) => {
      regMap[r.key] = {
        ordersCount: 0,
        salesUzs: 0,
        itemsQty: 0,
        b2bCount: 0,
        b2cCount: 0,
        suppliersCount: 0,
        customersCount: 0,
      };
    });

    // 1) Viloyatdagi B2B va B2C Ta'minotchi kabinetlar sonini hisoblash
    suppliers.forEach((s) => {
      const matchedKey = resolveRegionKey(s.region, s.district) || UZBEKISTAN_REGIONS[0].key;
      if (regMap[matchedKey]) {
        regMap[matchedKey].suppliersCount += 1;
        if (s.cabinetType === 'manufacturer') {
          regMap[matchedKey].b2bCount += 1;
        } else {
          regMap[matchedKey].b2cCount += 1;
        }
      }
    });

    // 2) Viloyatdagi Foydalanuvchi (Mijoz) kabinetlar sonini hisoblash
    customers.forEach((c) => {
      const matchedKey = resolveRegionKey(c.region, c.district) || UZBEKISTAN_REGIONS[0].key;
      if (regMap[matchedKey]) {
        regMap[matchedKey].customersCount += 1;
      }
    });

    // 3) Viloyatdagi Buyurtmalar (Talab) va Savdo hajmini hisoblash
    validOrders.forEach((o) => {
      const rawRegion = (o as any).deliveryRegion || '';
      const rawAddr = o.deliveryAddress || '';
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length === 0) {
        const fallbackKey = resolveRegionKey(rawRegion, rawAddr) || UZBEKISTAN_REGIONS[0].key;
        regMap[fallbackKey].ordersCount += 1;
        regMap[fallbackKey].salesUzs += Number(o.totalAmount) || 0;
        return;
      }

      const countedRegionsForOrder = new Set<string>();
      items.forEach((item: any) => {
        const qty = Number(item?.quantity) || 1;
        const price = Number(item?.price) || Number(item?.product?.price) || 0;
        const lineSum = qty * price;
        const matchedProd = products.find(
          (p) =>
            p.id === item?.productId ||
            (p.title && item?.title && p.title.trim().toLowerCase() === item.title.trim().toLowerCase())
        );
        const matchedSupp = suppliers.find((s) =>
          doesOrderItemBelongToSupplier(item, matchedProd, s, suppliers)
        );
        const itemRegKey = matchedSupp
          ? resolveRegionKey(matchedSupp.region, matchedSupp.district) || UZBEKISTAN_REGIONS[0].key
          : resolveRegionKey(item?.region || matchedProd?.region || rawRegion, rawAddr) || UZBEKISTAN_REGIONS[0].key;

        regMap[itemRegKey].salesUzs += lineSum;
        regMap[itemRegKey].itemsQty += qty;
        countedRegionsForOrder.add(itemRegKey);
      });
      countedRegionsForOrder.forEach((rk) => {
        regMap[rk].ordersCount += 1;
      });
    });

    validB2bOrders.forEach((bo) => {
      const matchedSupp = suppliers.find(
        (s) =>
          (bo.manufacturerId && bo.manufacturerId === s.id) ||
          (bo.manufacturerCompanyName &&
            cleanCompanyName(bo.manufacturerCompanyName) === cleanCompanyName(s.companyName))
      );
      const matchedKey = matchedSupp
        ? resolveRegionKey(matchedSupp.region, matchedSupp.district) || UZBEKISTAN_REGIONS[0].key
        : resolveRegionKey(bo.manufacturerRegion, bo.buyerRegion) || UZBEKISTAN_REGIONS[0].key;
      const amount = Number(bo.totalAmount) || 0;
      regMap[matchedKey].ordersCount += 1;
      regMap[matchedKey].salesUzs += amount;
    });

    const totalRegCabinets = Object.values(regMap).reduce(
      (s, r) => s + r.suppliersCount + r.customersCount,
      0
    );
    const totalRegSales = Object.values(regMap).reduce((s, r) => s + r.salesUzs, 0);
    const maxRegCabinets = Math.max(
      ...Object.values(regMap).map((r) => r.suppliersCount + r.customersCount),
      1
    );
    const maxRegSales = Math.max(...Object.values(regMap).map((r) => r.salesUzs), 1);

    return UZBEKISTAN_REGIONS.map((r) => {
      const data = regMap[r.key];
      const totalCabinets = data.suppliersCount + data.customersCount;
      const shareByCabinets =
        totalRegCabinets > 0 ? Math.round((totalCabinets / totalRegCabinets) * 100) : 0;
      const shareBySales = totalRegSales > 0 ? Math.round((data.salesUzs / totalRegSales) * 100) : 0;
      const sharePct = totalRegCabinets > 0 ? shareByCabinets : shareBySales;

      const barPct =
        totalCabinets > 0
          ? Math.max(14, Math.round((totalCabinets / maxRegCabinets) * 100))
          : data.salesUzs > 0
          ? Math.max(14, Math.round((data.salesUzs / maxRegSales) * 100))
          : 0;

      return {
        region: r.key,
        color: r.color,
        hex: r.hex,
        ordersCount: data.ordersCount,
        itemsQty: data.itemsQty,
        salesUzs: data.salesUzs,
        b2bCount: data.b2bCount,
        b2cCount: data.b2cCount,
        suppliersCount: data.suppliersCount,
        customersCount: data.customersCount,
        totalCabinets,
        sharePct,
        barPct,
      };
    });
  }, [filteredOrders, filteredB2bOrders, suppliers, customers]);

  return (
    <div className="w-full space-y-2.5 sm:space-y-6 mt-2.5 sm:mt-0 animate-fadeIn text-[#F5F5F2]">
      {/* TOP HEADER & VAQT FILTRI (KUN, HAFTA, OY, VAQT ORALIG'I — MONITORING BO'LIMI UCHUN UMUMIYDA ISHLAYDI) */}
      <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 sm:gap-4">
          <div className="space-y-0.5 sm:space-y-1">
            <h1 className="text-sm sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-snug">
              Monitoring va Hisobotlar Paneli
            </h1>
          </div>

          {/* Period filters: Kun, Hafta, Oy va Vaqt oralig'i (Umumiyda ishlaydi) */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSelectedPeriod(null)}
              className={`px-2 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === null
                  ? 'bg-[#FFB800] text-[#0A1931] font-black shadow-md'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              Umumiy
            </button>
            <button
              type="button"
              onClick={() => setSelectedPeriod((prev) => (prev === 'day' ? null : 'day'))}
              className={`px-2 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === 'day'
                  ? 'bg-[#FFB800] text-[#0A1931] font-black shadow-md'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              Kun
            </button>
            <button
              type="button"
              onClick={() => setSelectedPeriod((prev) => (prev === 'week' ? null : 'week'))}
              className={`px-2 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === 'week'
                  ? 'bg-[#FFB800] text-[#0A1931] font-black shadow-md'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              Hafta
            </button>
            <button
              type="button"
              onClick={() => setSelectedPeriod((prev) => (prev === 'month' ? null : 'month'))}
              className={`px-2 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === 'month'
                  ? 'bg-[#FFB800] text-[#0A1931] font-black shadow-md'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              Oy
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRangeModalOpen(true);
              }}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                selectedPeriod === 'range'
                  ? 'bg-[#FFB800] text-[#0A1931] font-black shadow-md'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Vaqt oralig'i</span>
              {selectedPeriod === 'range' && (
                <span className="text-[9px] sm:text-[10px] bg-[#0A1931] text-[#FFB800] px-1 sm:px-1.5 py-0.5 rounded font-mono ml-0.5 sm:ml-1 font-bold">
                  {startDate.slice(5)} - {endDate.slice(5)}
                </span>
              )}
            </button>
            {selectedPeriod !== null && (
              <button
                type="button"
                onClick={() => setSelectedPeriod(null)}
                title="Umumiy barchasini ko'rsatish"
                className="px-1.5 sm:px-2.5 py-1 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold text-[#FFB800] hover:bg-[#132C54] transition-all cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Modal */}
        {isRangeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0A1931] border-2 border-[#FFB800] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-[#1E3A6D]">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#FFB800]" />
                  <h3 className="text-sm font-black text-white">Vaqt oralig'ini belgilash</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRangeModalOpen(false)}
                  className="p-1 rounded bg-[#071326] text-sky-200 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-sky-200 font-bold block">Boshlang‘ich sana:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#071326] border border-[#1E3A6D] rounded-lg text-white focus:outline-none focus:border-[#FFB800] font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sky-200 font-bold block">Tugash sanasi:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#071326] border border-[#1E3A6D] rounded-lg text-white focus:outline-none focus:border-[#FFB800] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1E3A6D]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPeriod(null);
                    setIsRangeModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#071326] text-xs font-bold text-sky-200 hover:text-white cursor-pointer"
                >
                  Umumiy (Barchasi)
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRangeModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg bg-[#071326] text-xs font-bold text-sky-200 hover:text-white cursor-pointer"
                  >
                    Yopish
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPeriod('range');
                      setIsRangeModalOpen(false);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-[#FFB800] hover:bg-[#FFC928] text-[#0A1931] text-xs font-black shadow-md cursor-pointer"
                  >
                    Belgilash
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 1-QATOR: B2B KABINETLAR SONI, B2C KABINETLAR SONI VA FOYDALANUVCHI KABINETLAR SONI (UMUMIY AYLANMA, FOYDA VA BUNKER FOYDASI BILAN) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
        {/* 1. B2B Kabinetlar Soni va Savdo Aylanmasi */}
        <div className="bg-[#0A1931] border-2 border-[#FFB800]/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xl flex flex-col justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2 sm:pb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#FFB800]/20 border border-[#FFB800]/50 text-[#FFB800] flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-base font-black text-white truncate">B2B Kabinetlar Soni</h3>
              </div>
            </div>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 text-[#FFB800] font-mono font-black text-xs sm:text-lg shrink-0">
              {supplierSalesStats.b2bCabinetsCount} ta
            </span>
          </div>

          <div className="p-2 sm:p-3.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-1 sm:space-y-2 text-[10px] sm:text-xs font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sky-200 font-bold">B2B Umumiy Aylanmasi:</span>
              <span className="text-xs sm:text-base font-black text-[#FFB800]">
                {formatSum(supplierSalesStats.b2bTurnoverUzs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 sm:pt-1.5 border-t border-[#1E3A6D]/70">
              <span className="text-sky-200">B2B Foydasi (Ta’minotchi):</span>
              <span className="font-black text-white">
                {formatSum(supplierSalesStats.b2bSupplierNetUzs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 sm:pt-1.5 border-t border-[#1E3A6D]/70">
              <span className="text-emerald-300 font-bold">Bunker Foydasi (Ulushi):</span>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 font-black">
                {formatSum(supplierSalesStats.b2bBunkerProfitUzs)}
              </span>
            </div>
          </div>
        </div>

        {/* 2. B2C Kabinetlar Soni va Savdo Aylanmasi */}
        <div className="bg-[#0A1931] border-2 border-emerald-500/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xl flex flex-col justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2 sm:pb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-base font-black text-white truncate">B2C Kabinetlar Soni</h3>
              </div>
            </div>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-[#071326] border border-emerald-400/50 text-emerald-400 font-mono font-black text-xs sm:text-lg shrink-0">
              {supplierSalesStats.b2cCabinetsCount} ta
            </span>
          </div>

          <div className="p-2 sm:p-3.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-1 sm:space-y-2 text-[10px] sm:text-xs font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sky-200 font-bold">B2C Umumiy Aylanmasi:</span>
              <span className="text-xs sm:text-base font-black text-[#FFB800]">
                {formatSum(supplierSalesStats.b2cTurnoverUzs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 sm:pt-1.5 border-t border-[#1E3A6D]/70">
              <span className="text-sky-200">B2C Foydasi (Ta’minotchi):</span>
              <span className="font-black text-white">
                {formatSum(supplierSalesStats.b2cSupplierNetUzs)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 sm:pt-1.5 border-t border-[#1E3A6D]/70">
              <span className="text-emerald-300 font-bold">Bunker Foydasi (Ulushi):</span>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 font-black">
                {formatSum(supplierSalesStats.b2cBunkerProfitUzs)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Foydalanuvchi Kabinetlar Soni va Savdo Aylanmasi */}
        <div className="bg-[#0A1931] border-2 border-blue-500/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xl flex flex-col justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2 sm:pb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-500/20 border border-blue-400/50 text-blue-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-base font-black text-white truncate">Foydalanuvchi Kabinetlar Soni</h3>
              </div>
            </div>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-[#071326] border border-blue-400/50 text-blue-400 font-mono font-black text-xs sm:text-lg shrink-0">
              {supplierSalesStats.customerCabinetsCount} ta
            </span>
          </div>

          <div className="p-2 sm:p-3.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-1 sm:space-y-2 text-[10px] sm:text-xs font-mono">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase text-sky-200">
                Umumiy savdoda:
              </span>
              <span className="text-xs sm:text-xl font-black text-blue-400 font-mono">
                {formatSum(supplierSalesStats.customerTotalTurnoverUzs)} aylanma
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-sky-300/80 pt-1 border-t border-[#1E3A6D]/70 flex items-center justify-between">
              <span>Onlayn buyurtmalar soni:</span>
              <strong className="text-white">{supplierSalesStats.validOrdersCount} ta</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2-QATOR: UMUMIY % (B2B HAM B2C HAM) — TA'MINOTCHILAR ULUSHI VA BUNKER STROY ULUSHI (% ... SO'M KO'RINISHIDA) */}
      <div className="bg-[#0A1931] border-2 border-[#FFB800]/70 rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-2 sm:pb-3 border-b border-[#1E3A6D]">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-lg font-black text-white leading-snug">
                Umumiy Savdodan Kelgan Mablag‘ va Ulushlar Monitoringi (B2B + B2C)
              </h2>
            </div>
          </div>
          <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 font-mono text-[11px] sm:text-base text-[#FFB800] font-black self-start sm:self-auto">
            Umumiy savdo (100%): {formatSum(supplierSalesStats.totalTransferredUzs)}
          </span>
        </div>

        {/* Ta'minotchilar Ulushi va Bunker Stroy Ulushi (Yashil bilan) */}
        <div className="p-2.5 sm:p-5 rounded-xl bg-[#071326] border border-[#1E3A6D] flex flex-col md:flex-row items-center gap-2.5 sm:gap-6">
          {(() => {
            const radius = 52;
            const circumference = 2 * Math.PI * radius;
            const total = supplierSalesStats.totalTransferredUzs;
            const profit = supplierSalesStats.totalBunkerProfitUzs;
            const netSupp = Math.max(0, total - profit);

            const suppPct = supplierSalesStats.supplierSharePct;
            const bunkerPct = supplierSalesStats.bunkerSharePct;
            const hasData = total > 0;

            const suppDashLen = hasData ? (suppPct / 100) * circumference : 0;
            const bunkerDashLen = hasData ? (bunkerPct / 100) * circumference : 0;

            return (
              <>
                <div className="relative w-24 h-24 sm:w-36 sm:h-36 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                    <circle
                      cx="70"
                      cy="70"
                      r={radius}
                      fill="transparent"
                      stroke="#0A1931"
                      strokeWidth="16"
                    />
                    {hasData && (
                      <>
                        {/* Ta'minotchilar Ulushi — Ko'k rangda */}
                        <circle
                          cx="70"
                          cy="70"
                          r={radius}
                          fill="transparent"
                          stroke="#3B82F6"
                          strokeWidth="16"
                          strokeDasharray={`${suppDashLen} ${circumference}`}
                          strokeDashoffset={0}
                          className="transition-all duration-700"
                        />
                        {/* Bunker Stroy Ulushi — Yashil rangda */}
                        <circle
                          cx="70"
                          cy="70"
                          r={radius}
                          fill="transparent"
                          stroke="#10B981"
                          strokeWidth="16"
                          strokeDasharray={`${bunkerDashLen} ${circumference}`}
                          strokeDashoffset={-suppDashLen}
                          className="transition-all duration-700"
                        />
                      </>
                    )}
                  </svg>
                </div>

                <div className="flex-1 w-full space-y-2 sm:space-y-3">
                  {/* 1. Ta'minotchilar Ulushi (B2B + B2C) */}
                  <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-blue-500/50 hover:border-blue-400 transition-all space-y-1 sm:space-y-1.5 text-[11px] sm:text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2.5">
                        <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                        <span className="font-black text-white">Ta’minotchilar Ulushi (B2B + B2C)</span>
                      </div>
                      <div className="font-mono font-black flex items-center gap-1.5 sm:gap-2.5">
                        <span className="px-1.5 sm:px-2.5 py-0.5 rounded-md sm:rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/40 text-[10px] sm:text-xs">
                          {suppPct}%
                        </span>
                        <span className="text-blue-400 text-xs sm:text-base">{formatSum(netSupp)}</span>
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-mono text-sky-200 flex flex-wrap items-center gap-1.5 sm:gap-3 pl-4 sm:pl-6">
                      <span>B2B ta’minotchi ulushi: <strong className="text-white">{formatSum(supplierSalesStats.b2bSupplierNetUzs)}</strong></span>
                      <span>•</span>
                      <span>B2C ta’minotchi ulushi: <strong className="text-white">{formatSum(supplierSalesStats.b2cSupplierNetUzs)}</strong></span>
                    </div>
                  </div>

                  {/* 2. Bunker Stroy Ulushi (Yashil rang bilan) */}
                  <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-emerald-500/60 hover:border-emerald-400 transition-all space-y-1 sm:space-y-1.5 text-[11px] sm:text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2.5">
                        <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                        <span className="font-black text-white">Bunker Stroy Ulushi (B2B + B2C)</span>
                      </div>
                      <div className="font-mono font-black flex items-center gap-1.5 sm:gap-2.5">
                        <span className="px-1.5 sm:px-2.5 py-0.5 rounded-md sm:rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 text-[10px] sm:text-xs">
                          {bunkerPct}%
                        </span>
                        <span className="text-emerald-400 text-xs sm:text-base">{formatSum(profit)}</span>
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-mono text-emerald-200/90 flex flex-wrap items-center gap-1.5 sm:gap-3 pl-4 sm:pl-6">
                      <span>B2B dan Bunker ulushi: <strong className="text-emerald-400">{formatSum(supplierSalesStats.b2bBunkerProfitUzs)}</strong></span>
                      <span>•</span>
                      <span>B2C dan Bunker ulushi: <strong className="text-emerald-400">{formatSum(supplierSalesStats.b2cBunkerProfitUzs)}</strong></span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 3-QATOR: UMUMIY SAVDO HAJMI — BUNKER OYLIK SAVDO HAJMI & TALAB DINAMIKASI (12 OY: YAN — DEK) */}
      <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-7 shadow-2xl space-y-2.5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 pb-2 sm:pb-4 border-b border-[#1E3A6D]">
          <div>
            <h2 className="text-xs sm:text-xl font-black text-white flex items-center gap-1.5 sm:gap-2">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFB800] shrink-0" />
              <span>Bunker Oylik Savdo Hajmi & Talab Dinamikasi</span>
            </h2>
            <p className="text-[10px] sm:text-xs text-sky-200 mt-0.5">
              Umumiy savdo hajmi va buyurtmalar talabi ko‘rsatkichi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] sm:text-xs font-mono font-black">
              Talab: {total12MonthsDemand} buyurtma
            </span>
            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30 text-[10px] sm:text-xs font-mono font-black">
              Jami: {formatSum(total12MonthsTurnover)}
            </span>
          </div>
        </div>

        {/* Diagramma Legendasi: Talab va Savdo */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-xs font-mono px-1 sm:px-2">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1 sm:gap-1.5 text-white font-bold">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-[#FFB800] inline-block" />
              Savdo hajmi (so‘m)
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5 text-blue-400 font-bold">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-blue-500 inline-block" />
              Talab (buyurtmalar soni)
            </span>
          </div>
          <span className="text-[9px] sm:text-xs text-sky-200">12 oylik ko‘rsatkich (Yanvar — Dekabr)</span>
        </div>

        {/* 12 Months Dual-Bar Chart (Talab + Savdo) */}
        <div className="pt-2 sm:pt-6 pb-1 sm:pb-2 overflow-x-auto">
          <div className="min-w-[520px] sm:min-w-[680px] h-44 sm:h-72 w-full flex items-end justify-between gap-1.5 sm:gap-3 px-1 sm:px-4 relative">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
              <div className="border-b border-[#1E3A6D] w-full" />
              <div className="border-b border-[#1E3A6D] w-full" />
              <div className="border-b border-[#1E3A6D] w-full" />
              <div className="border-b border-[#1E3A6D] w-full" />
            </div>

            {monthlyData.map((item, idx) => {
              const isHovered = activeBarHover === idx;
              return (
                <div
                  key={item.month}
                  className="flex-1 flex flex-col items-center h-full justify-end relative group cursor-pointer"
                  onMouseEnter={() => setActiveBarHover(idx)}
                  onMouseLeave={() => setActiveBarHover(null)}
                >
                  <div
                    className={`mb-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-[#071326] border text-center transition-all duration-200 whitespace-nowrap ${
                      isHovered || item.val > 0
                        ? 'border-[#FFB800] opacity-100'
                        : 'border-[#1E3A6D]/70 opacity-85'
                    }`}
                  >
                    <div className="text-[8px] sm:text-[9px] text-sky-200 uppercase font-mono">{item.month}</div>
                    <div className="text-[8px] sm:text-[10px] font-black text-[#FFB800] font-mono">{item.displayUzs}</div>
                    <div className="text-[8px] sm:text-[9px] font-bold text-blue-400 font-mono">{item.demandCount} ta</div>
                  </div>

                  {/* Dual Bars: Savdo (Yellow) + Talab (Blue) */}
                  <div className="w-full max-w-[32px] sm:max-w-[44px] bg-[#071326] rounded-t-md sm:rounded-t-lg border border-[#1E3A6D] overflow-hidden p-0.5 sm:p-1 group-hover:border-[#FFB800] transition-all flex items-end justify-center gap-0.5 sm:gap-1">
                    <div
                      className={`flex-1 rounded-t transition-all duration-700 ease-out ${
                        isHovered ? 'bg-[#FFC928]' : 'bg-[#FFB800]'
                      }`}
                      style={{ height: `${item.val > 0 ? Math.max(6, item.salesPct * 1.1) : 2}px` }}
                      title={`Savdo: ${item.full}`}
                    />
                    <div
                      className="flex-1 bg-blue-500 rounded-t transition-all duration-700 ease-out"
                      style={{ height: `${item.demandCount > 0 ? Math.max(6, item.demandPct * 1.1) : 2}px` }}
                      title={`Talab: ${item.demandCount} buyurtma`}
                    />
                  </div>

                  <span
                    className={`mt-1.5 sm:mt-2.5 text-[9px] sm:text-[11px] font-mono uppercase font-bold transition-colors ${
                      isHovered ? 'text-[#FFB800]' : 'text-sky-200'
                    }`}
                  >
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4-QATOR: HUDUDLAR MIQYOSIDA KABINETLAR DIAGRAMMASI (14 TA HUDUD BO'YICHA B2B, B2C, FOYDALANUVCHI KABINETLAR VA SAVDO) */}
      <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-7 shadow-2xl space-y-2.5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-2 sm:pb-4 border-b border-[#1E3A6D]">
          <div>
            <h3 className="text-xs sm:text-xl font-black text-white flex items-center gap-1.5 sm:gap-2">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFB800] shrink-0" />
              <span>Hududlar Miqyosida Kabinetlar Diagrammasi</span>
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-[#FFB800] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#FFB800]/40">
              B2B: {supplierSalesStats.b2bCabinetsCount} ta
            </span>
            <span className="text-[10px] sm:text-xs font-mono font-bold text-emerald-400 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-emerald-400/40">
              B2C: {supplierSalesStats.b2cCabinetsCount} ta
            </span>
            <span className="text-[10px] sm:text-xs font-mono font-bold text-blue-400 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-blue-400/40">
              Foydalanuvchi: {supplierSalesStats.customerCabinetsCount} ta
            </span>
            <span className="text-[10px] sm:text-xs font-mono font-bold text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#1E3A6D]">
              {formatSum(regionalDemands.reduce((s, r) => s + r.salesUzs, 0))}
            </span>
          </div>
        </div>

        {/* Hududlar Miqyosida Kabinetlar Ustunli Diagrammasi */}
        <div className="p-2 sm:p-4 rounded-xl bg-[#071326] border border-[#1E3A6D] overflow-x-auto">
          <div className="min-w-[540px] sm:min-w-[680px]">
            <div className="h-36 sm:h-48 flex items-end justify-between gap-1.5 sm:gap-2 pt-3 sm:pt-4 px-1 sm:px-2 border-b border-[#1E3A6D]">
              {regionalDemands.map((reg) => (
                <div
                  key={reg.region}
                  className="flex-1 flex flex-col items-center justify-end h-full group"
                >
                  <span className="text-[8px] sm:text-[9px] font-mono font-bold text-sky-200 mb-0.5 truncate max-w-[44px] sm:max-w-none">
                    {reg.salesUzs > 0 ? `${Math.round(reg.salesUzs / 1000)}k` : '0'}
                  </span>
                  <span className="text-[8px] sm:text-[10px] font-mono font-black text-[#FFB800] mb-1">
                    {reg.totalCabinets}ta
                  </span>
                  <div className="w-full max-w-[28px] sm:max-w-[36px] bg-[#0A1931] rounded-t-md sm:rounded-t-lg border border-[#1E3A6D] p-0.5 sm:p-1 flex items-end justify-center gap-0.5">
                    <div
                      className={`w-full ${reg.color} rounded-t transition-all duration-700`}
                      style={{ height: `${reg.barPct > 0 ? Math.max(8, reg.barPct * 0.95) : 3}px` }}
                      title={`${reg.region}: B2B ${reg.b2bCount} ta, B2C ${reg.b2cCount} ta, Foydalanuvchi ${reg.customersCount} ta`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-1 sm:gap-2 pt-1.5 sm:pt-2 px-1">
              {regionalDemands.map((reg) => (
                <div key={reg.region} className="flex-1 text-center">
                  <span
                    className="text-[8px] sm:text-[9px] font-bold text-sky-200 block truncate"
                    title={reg.region}
                  >
                    {reg.region.replace(' viloyati', '').replace(' Resp.', '').replace(' shahri', ' sh.')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 14 ta Hudud Kartalari: Mobilda 2 ustunli ixcham ko'rinishda */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
          {regionalDemands.map((reg) => (
            <div
              key={reg.region}
              className="p-2 sm:p-4 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] hover:border-[#FFB800]/60 transition-colors space-y-1.5 sm:space-y-2.5"
            >
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold text-white gap-1">
                <span className="truncate">{reg.region.replace(' viloyati', ' vil.').replace('Qoraqalpog‘iston Resp.', 'Qoraqalpog‘iston')}</span>
                <span className="text-[#FFB800] font-mono font-black shrink-0">{reg.sharePct}%</span>
              </div>

              <div className="flex items-center justify-between text-[9px] sm:text-[11px] font-mono text-sky-200">
                <span>Kabinet: <strong className="text-white">{reg.totalCabinets} ta</strong></span>
                <span>Talab: <strong className="text-[#FFB800]">{reg.ordersCount} ta</strong></span>
              </div>

              <div className="text-[9px] sm:text-[11px] font-mono text-sky-200 truncate">
                Savdo: <span className="text-white font-bold">{formatSum(reg.salesUzs)}</span>
              </div>

              {/* Viloyatdagi B2B, B2C va Foydalanuvchi kabinetlar soni */}
              <div className="pt-1.5 sm:pt-2 border-t border-[#1E3A6D] grid grid-cols-3 gap-1 sm:gap-1.5 text-[9px] sm:text-[10px]">
                <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-[#0A1931] border border-[#FFB800]/40 flex flex-col items-center sm:items-start">
                  <span className="text-sky-200 truncate">B2B:</span>
                  <span className="font-mono font-black text-[#FFB800] text-[10px] sm:text-xs">
                    {reg.b2bCount}
                  </span>
                </div>
                <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-[#0A1931] border border-emerald-400/40 flex flex-col items-center sm:items-start">
                  <span className="text-sky-200 truncate">B2C:</span>
                  <span className="font-mono font-black text-emerald-400 text-[10px] sm:text-xs">
                    {reg.b2cCount}
                  </span>
                </div>
                <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-[#0A1931] border border-blue-400/40 flex flex-col items-center sm:items-start">
                  <span className="text-sky-200 truncate">Mijoz:</span>
                  <span className="font-mono font-black text-blue-400 text-[10px] sm:text-xs">
                    {reg.customersCount}
                  </span>
                </div>
              </div>

              <div className="w-full h-1.5 sm:h-2 rounded-full bg-[#0A1931] overflow-hidden">
                <div
                  className={`h-full ${reg.color} rounded-full transition-all duration-700`}
                  style={{ width: `${reg.barPct > 0 ? Math.max(4, reg.barPct) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
