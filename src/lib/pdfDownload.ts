import { jsPDF } from 'jspdf';

const sanitizePdfText = (text: string | number | undefined | null): string => {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/•/g, '|')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
};

const formatCurrency = (n: number): string => {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0)).replace(/\u00A0/g, ' ') + " so'm";
};

export interface MonitoringPdfParams {
  reportTitle: string;
  companyName: string;
  inn?: string;
  region?: string;
  phone?: string;
  periodLabel: string;
  subTab: 'general' | 'online' | 'offline' | 'kirim_chiqim';
  commissionRate: number;
  generalSalesTotalSum: number;
  generalSalesCount: number;
  onlineSalesTotalSum: number;
  onlineBunkerCommissionSum: number;
  offlineCrmSalesTotalSum: number;
  generalSupplierNetSum: number;
  dailyGroups: {
    day: string;
    totalSum: number;
    commissionSum: number;
    netSum: number;
    items: {
      date: string;
      orderChannel?: string;
      productTitle: string;
      category: string;
      quantity: number;
      unit: string;
      price: number;
      totalSum: number;
      commission: number;
      net: number;
      buyerName: string;
      buyerPhone: string;
      status: string;
    }[];
  }[];
  kirimChiqimRows?: {
    title: string;
    category: string;
    unit: string;
    costP: number;
    bunkerP: number;
    crmP: number;
    unitProfitOnline: number;
    unitProfitCrm: number;
    remainStock: number;
    totalInitialQty: number;
    soldQty: number;
    soldRevenue: number;
    totalNetProfit: number;
  }[];
}

export const downloadMonitoringPdfFile = (params: MonitoringPdfParams) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 14;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 12) {
      doc.addPage();
      y = 14;
    }
  };

  // Header Banner
  doc.setFillColor(10, 25, 49);
  doc.rect(10, y, pageWidth - 20, 22, 'F');
  doc.setTextColor(255, 184, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(sanitizePdfText(params.reportTitle.toUpperCase()), 15, y + 8);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(
    sanitizePdfText(
      `Korxona: ${params.companyName} ${params.inn ? `| STIR: ${params.inn}` : ''} | Hudud: ${params.region || 'Toshkent'}`
    ),
    15,
    y + 14
  );
  doc.setTextColor(186, 230, 253);
  doc.text(
    sanitizePdfText(`Hisobot davri: ${params.periodLabel} | Sana: ${new Date().toLocaleString('uz-UZ')}`),
    15,
    y + 19
  );
  y += 27;

  // Summary Cards Row
  const boxW = (pageWidth - 26) / 4;
  const cards =
    params.subTab === 'kirim_chiqim' && params.kirimChiqimRows
      ? [
          {
            label: '1. Ombordagi Qoldiq Tan Narxi',
            val: formatCurrency(params.kirimChiqimRows.reduce((s, r) => s + r.remainStock * r.costP, 0)),
          },
          {
            label: '2. Sotilgan Mahsulot Tan Narxi',
            val: formatCurrency(params.kirimChiqimRows.reduce((s, r) => s + r.soldQty * r.costP, 0)),
          },
          {
            label: '3. Sotilgan Mahsulot Tushumi',
            val: formatCurrency(params.kirimChiqimRows.reduce((s, r) => s + r.soldRevenue, 0)),
          },
          {
            label: '4. Jami Sof Foyda',
            val: formatCurrency(params.kirimChiqimRows.reduce((s, r) => s + r.totalNetProfit, 0)),
          },
        ]
      : [
          {
            label: '1. Jami Umumiy Savdo',
            val: `${formatCurrency(params.generalSalesTotalSum)} (${params.generalSalesCount} ta)`,
          },
          {
            label: '2. Onlayn Bunker Savdosi',
            val: formatCurrency(params.onlineSalesTotalSum),
          },
          {
            label: '3. CRM Savdo',
            val: formatCurrency(params.offlineCrmSalesTotalSum),
          },
          {
            label: '4. Korxona Jami Daromadi',
            val: formatCurrency(params.generalSupplierNetSum),
          },
        ];

  cards.forEach((c, idx) => {
    const x = 10 + idx * (boxW + 2);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, boxW, 14, 'FD');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(c.label), x + 3, y + 5);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(sanitizePdfText(c.val), x + 3, y + 11);
  });
  y += 19;

  if (params.subTab === 'kirim_chiqim' && params.kirimChiqimRows) {
    // Kirim-Chiqim Table
    const cols = [
      { title: '#', w: 10 },
      { title: 'Mahsulot Nomi', w: 52 },
      { title: 'Asl (Keltirilgan) Narxi', w: 34 },
      { title: 'Sotilayotgan Narxi', w: 42 },
      { title: '1 Birlikdan Foyda', w: 38 },
      { title: 'Ombordagi Qoldiq', w: 34 },
      { title: 'Sotilgan', w: 22 },
      { title: 'Jami Sotuv', w: 26 },
      { title: 'Jami Sof Foyda', w: 19 },
    ];

    doc.setFillColor(15, 23, 42);
    doc.rect(10, y, pageWidth - 20, 8, 'F');
    doc.setTextColor(255, 184, 0);
    doc.setFontSize(7.5);
    let cx = 10;
    cols.forEach((col) => {
      doc.text(sanitizePdfText(col.title), cx + 2, y + 5.3);
      cx += col.w;
    });
    y += 8;

    params.kirimChiqimRows.forEach((r, idx) => {
      ensureSpace(9);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(10, y, pageWidth - 20, 8.5, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(10, y, pageWidth - 20, 8.5, 'S');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      const stockLabel = r.remainStock <= 0 ? `Tugagan (0 ${r.unit})` : `${r.remainStock} ${r.unit}`;
      const rowVals = [
        String(idx + 1),
        `${r.title} (${r.category})`.slice(0, 32),
        formatCurrency(r.costP),
        `Onl: ${formatCurrency(r.bunkerP)}`,
        `${r.unitProfitOnline >= 0 ? '+' : ''}${formatCurrency(r.unitProfitOnline)}`,
        stockLabel,
        `${r.soldQty} ${r.unit}`,
        formatCurrency(r.soldRevenue),
        `${r.totalNetProfit >= 0 ? '+' : ''}${formatCurrency(r.totalNetProfit)}`,
      ];

      let rx = 10;
      rowVals.forEach((val, cIdx) => {
        doc.text(sanitizePdfText(val), rx + 2, y + 5.5);
        rx += cols[cIdx].w;
      });
      y += 8.5;
    });
  } else {
    // Sales Table grouped by Day
    if (params.dailyGroups.length === 0) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(10);
      doc.text("Tanlangan davr bo'yicha savdo yozuvlari mavjud emas.", 14, y + 8);
    } else {
      const cols = [
        { title: 'Sana / Vaqt', w: 28 },
        { title: 'Tizim / Kanal', w: 25 },
        { title: 'Mahsulot Nomi', w: 52 },
        { title: 'Miqdor', w: 20 },
        { title: 'Birlik Narxi', w: 28 },
        { title: 'Jami Summa', w: 30 },
        ...(params.subTab === 'general' ? [{ title: 'Bunker Ulushi', w: 26 }] : []),
        { title: 'Korxona Tushumi', w: 30 },
        { title: 'Xaridor / Mijoz', w: params.subTab === 'general' ? 38 : 64 },
      ];

      params.dailyGroups.forEach((group) => {
        ensureSpace(18);
        doc.setFillColor(15, 23, 42);
        doc.rect(10, y, pageWidth - 20, 7.5, 'F');
        doc.setTextColor(255, 184, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(
          sanitizePdfText(
            `KUNLIK HISOBOT: ${group.day} (${group.items.length} ta savdo) | Jami: ${formatCurrency(group.totalSum)} | Korxona tushumi: ${formatCurrency(group.netSum)}`
          ),
          13,
          y + 5
        );
        y += 7.5;

        doc.setFillColor(30, 41, 59);
        doc.rect(10, y, pageWidth - 20, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.2);
        let cx = 10;
        cols.forEach((col) => {
          doc.text(sanitizePdfText(col.title), cx + 2, y + 4.8);
          cx += col.w;
        });
        y += 7;

        group.items.forEach((sale, sIdx) => {
          ensureSpace(8);
          if (sIdx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(10, y, pageWidth - 20, 7.5, 'F');
          }
          doc.setDrawColor(226, 232, 240);
          doc.rect(10, y, pageWidth - 20, 7.5, 'S');
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.2);

          const isOff = sale.orderChannel === 'offline';
          const rowVals = [
            sale.date,
            isOff ? 'CRM savdo' : 'Onlayn Bunker',
            `${sale.productTitle} (${sale.category})`.slice(0, 32),
            `${sale.quantity} ${sale.unit}`,
            formatCurrency(sale.price),
            formatCurrency(sale.totalSum),
            ...(params.subTab === 'general'
              ? [isOff ? "0 so'm (CRM)" : formatCurrency(sale.commission)]
              : []),
            formatCurrency(sale.net),
            `${sale.buyerName} (${sale.buyerPhone || '-'})`.slice(0, 32),
          ];

          let rx = 10;
          rowVals.forEach((val, cIdx) => {
            doc.text(sanitizePdfText(val), rx + 2, y + 5);
            rx += cols[cIdx].w;
          });
          y += 7.5;
        });
        y += 3;
      });
    }
  }

  const safeComp = sanitizePdfText(params.companyName).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24) || 'Korxona';
  doc.save(`Monitoring_${safeComp}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadB2bManifestPdfFile = (manifest: {
  id: string;
  createdAt?: string;
  status: string;
  driverPhone?: string;
  buyerCompanyName: string;
  buyerInn?: string;
  buyerDirector?: string;
  buyerPhone: string;
  buyerRegion?: string;
  buyerAddress?: string;
  manufacturerCompanyName: string;
  manufacturerInn?: string;
  manufacturerPhone?: string;
  manufacturerRegion?: string;
  totalAmount: number;
  items: {
    title: string;
    specification?: string;
    color?: string;
    quantity: number;
    unit: string;
    price: number;
    totalSum: number;
  }[];
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFillColor(10, 25, 49);
  doc.rect(12, y, pageWidth - 24, 20, 'F');
  doc.setTextColor(255, 184, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('BUNKER STROY B2B - YUK XATI VA BUYURTMA ROYХATI', 16, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text(
    sanitizePdfText(
      `Hujjat: #${manifest.id} | Sana: ${
        manifest.createdAt ? new Date(manifest.createdAt).toLocaleString('uz-UZ') : new Date().toLocaleString('uz-UZ')
      }`
    ),
    16,
    y + 15
  );
  y += 25;

  // Buyer & Supplier Info
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, y, (pageWidth - 28) / 2, 26, 'FD');
  doc.rect(16 + (pageWidth - 28) / 2, y, (pageWidth - 28) / 2, 26, 'FD');

  doc.setTextColor(180, 83, 9);
  doc.setFontSize(8.5);
  doc.text("1. SOTIB OLUVCHI KORXONA MA'LUMOTLARI", 15, y + 6);
  doc.text("2. YETKAZIB BERUVCHI ZAVOD MA'LUMOTLARI", 19 + (pageWidth - 28) / 2, y + 6);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(sanitizePdfText(`Korxona: ${manifest.buyerCompanyName}`), 15, y + 12);
  doc.text(sanitizePdfText(`STIR: ${manifest.buyerInn || '-'} | Tel: ${manifest.buyerPhone}`), 15, y + 17);
  doc.text(sanitizePdfText(`Manzil: ${manifest.buyerAddress || manifest.buyerRegion || '-'}`), 15, y + 22);

  const rx = 19 + (pageWidth - 28) / 2;
  doc.text(sanitizePdfText(`Zavod: ${manifest.manufacturerCompanyName}`), rx, y + 12);
  doc.text(sanitizePdfText(`STIR: ${manifest.manufacturerInn || '-'} | Tel: ${manifest.manufacturerPhone || '-'}`), rx, y + 17);
  doc.text(sanitizePdfText(`Hudud: ${manifest.manufacturerRegion || '-'}`), rx, y + 22);
  y += 32;

  // Items Table
  const cols = [
    { title: '#', w: 10 },
    { title: 'Mahsulot Nomi', w: 68 },
    { title: 'Xususiyat / Rang', w: 36 },
    { title: 'Miqdori', w: 24 },
    { title: 'Narxi', w: 24 },
    { title: 'Jami Summa', w: 24 },
  ];

  doc.setFillColor(15, 23, 42);
  doc.rect(12, y, pageWidth - 24, 8, 'F');
  doc.setTextColor(255, 184, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let cx = 12;
  cols.forEach((c) => {
    doc.text(sanitizePdfText(c.title), cx + 2, y + 5.3);
    cx += c.w;
  });
  y += 8;

  manifest.items.forEach((it, idx) => {
    doc.setDrawColor(226, 232, 240);
    doc.rect(12, y, pageWidth - 24, 8, 'S');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const specCol = [it.specification, it.color].filter(Boolean).join(' | ') || 'Standart';
    const vals = [
      String(idx + 1),
      it.title.slice(0, 38),
      specCol.slice(0, 22),
      `${it.quantity} ${it.unit}`,
      formatCurrency(it.price),
      formatCurrency(it.totalSum),
    ];

    let x = 12;
    vals.forEach((v, cIdx) => {
      doc.text(sanitizePdfText(v), x + 2, y + 5.2);
      x += cols[cIdx].w;
    });
    y += 8;
  });

  doc.setFillColor(254, 243, 199);
  doc.rect(12, y, pageWidth - 24, 9, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(`JAMI B2B BUYURTMA SUMMASI: ${formatCurrency(manifest.totalAmount)}`), 15, y + 6);

  doc.save(`B2B_Yuk_Royxati_${manifest.id}.pdf`);
};

export const downloadCustomerOrderPdfFile = (
  cust: {
    orderIds: string[];
    lastOrderDate: string;
    status: string;
    driverPhone?: string;
    name: string;
    phone: string;
    address: string;
    totalSpent: number;
    itemsList: { title: string; quantity: number; unit: string; price: number; totalSum: number }[];
  },
  supplierData: { companyName: string; inn?: string; phone?: string; region?: string }
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFillColor(10, 25, 49);
  doc.rect(12, y, pageWidth - 24, 20, 'F');
  doc.setTextColor(255, 184, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("BUNKER STROY - MIJOZ MAHSULOT SO'ROVI RO'YXATI", 16, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text(
    sanitizePdfText(`Buyurtma: #${cust.orderIds.join(', #')} | Sana: ${cust.lastOrderDate}`),
    16,
    y + 15
  );
  y += 25;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, y, pageWidth - 24, 24, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.text(sanitizePdfText(`Xaridor: ${cust.name} | Tel: ${cust.phone}`), 16, y + 7);
  doc.text(sanitizePdfText(`Yetkazish manzili: ${cust.address}`), 16, y + 13);
  doc.text(
    sanitizePdfText(`Ta'minotchi: ${supplierData.companyName} (STIR: ${supplierData.inn || '-'})`),
    16,
    y + 19
  );
  y += 30;

  const cols = [
    { title: '#', w: 12 },
    { title: 'Mahsulot Nomi', w: 86 },
    { title: 'Miqdori', w: 28 },
    { title: 'Birlik Narxi', w: 30 },
    { title: 'Jami Summa', w: 30 },
  ];

  doc.setFillColor(15, 23, 42);
  doc.rect(12, y, pageWidth - 24, 8, 'F');
  doc.setTextColor(255, 184, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let cx = 12;
  cols.forEach((c) => {
    doc.text(sanitizePdfText(c.title), cx + 2, y + 5.3);
    cx += c.w;
  });
  y += 8;

  (cust.itemsList || []).forEach((it, idx) => {
    doc.setDrawColor(226, 232, 240);
    doc.rect(12, y, pageWidth - 24, 8, 'S');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const vals = [
      String(idx + 1),
      it.title.slice(0, 48),
      `${it.quantity} ${it.unit}`,
      formatCurrency(it.price),
      formatCurrency(it.totalSum),
    ];

    let x = 12;
    vals.forEach((v, cIdx) => {
      doc.text(sanitizePdfText(v), x + 2, y + 5.2);
      x += cols[cIdx].w;
    });
    y += 8;
  });

  doc.setFillColor(254, 243, 199);
  doc.rect(12, y, pageWidth - 24, 9, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(`JAMI SUMMA: ${formatCurrency(cust.totalSpent)}`), 15, y + 6);

  doc.save(`Mijoz_Sorovi_${cust.orderIds[0] || 'Buyurtma'}.pdf`);
};
