import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const AT_REST_MASTER_KEY = crypto
  .createHash('sha256')
  .update(
    process.env.SESSION_SECRET || 'bunkerstroy-aes256gcm-master-secret-key-2026',
  )
  .digest();

function seedHash(plain: string): string {
  const salt = crypto
    .createHmac('sha256', AT_REST_MASTER_KEY)
    .update(`bs-argon2id-salt:${plain}`)
    .digest()
    .subarray(0, 16);
  const derived = crypto.scryptSync(plain, salt, 32, { N: 16384, r: 8, p: 1 });
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt.toString('hex')}$${derived.toString('base64')}`;
}

async function main() {
  console.log('🌱 Starting BunkerS database seed on PostgreSQL (bunkers_db)...');

  // 1. Clean existing records in reverse dependency order
  await prisma.crmDebtRecord.deleteMany({});
  await prisma.b2BOrderRequest.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.logisticsVehicle.deleteMany({});
  await prisma.systemLog.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('🧹 Purged existing records successfully.');

  // 2. Users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@bunkerstroy.uz',
      phone: '+998901234567',
      displayName: 'Bunker Bosh Admin',
      firstName: 'Farrukh',
      lastName: 'Boshqaruvchi',
      role: 'bunker_admin',
      userType: 'legal',
      companyName: 'Bunker Stroy Global MCHJ',
      inn: '309998811',
      pinfl: '31201901230012',
      region: 'Toshkent shahri',
      district: 'Mirobod tumani',
      verificationStatus: 'verified',
      status: 'active',
      passwordHash: seedHash('BunkerAdmin2026!'),
    },
  });

  const customerUser = await prisma.user.create({
    data: {
      email: 'islombek@gmail.com',
      phone: '+998935001122',
      displayName: 'Islombek Karimov',
      firstName: 'Islombek',
      lastName: 'Karimov',
      role: 'contractor',
      userType: 'individual',
      region: 'Toshkent shahri',
      district: 'Yunusobod tumani',
      verificationStatus: 'verified',
      status: 'active',
    },
  });

  // 3. Suppliers (Zavodlar va Hamkor Do'konlar)
  const bekobodFactory = await prisma.supplier.create({
    data: {
      inn: '200112233',
      companyName: 'Bekobod Metallurgiya Kombinati AJ',
      name: 'Sherzod',
      surname: 'Mirzayev',
      phone: '+998901112233',
      login: 'bekobod_metall',
      passwordHash: seedHash('Partner2026!'),
      cabinetType: 'manufacturer',
      region: 'Toshkent viloyati',
      district: 'Bekobod shahar',
      category: 'Metallurgiya & Armatura',
      rating: 4.95,
      status: 'active',
      contractNumber: 'BMK-2026-78',
      commissionRate: 1.0,
      commissionBasis: 'total',
    },
  });

  const ohangaronFactory = await prisma.supplier.create({
    data: {
      inn: '201445566',
      companyName: 'Ohangaron Sement AJ',
      name: 'Dilshod',
      surname: 'Qosimov',
      phone: '+998912223344',
      login: 'ohangaron_sement',
      passwordHash: seedHash('Partner2026!'),
      cabinetType: 'manufacturer',
      region: 'Toshkent viloyati',
      district: 'Ohangaron',
      category: 'Sement va Qorishmalar',
      rating: 4.9,
      status: 'active',
      contractNumber: 'OS-2026-104',
      commissionRate: 1.2,
      commissionBasis: 'total',
    },
  });

  const knaufFactory = await prisma.supplier.create({
    data: {
      inn: '202778899',
      companyName: 'Knauf Gips Buxoro MCHJ',
      name: 'Azizbek',
      surname: 'Rahmonov',
      phone: '+998933334455',
      login: 'knauf_uz',
      passwordHash: seedHash('Partner2026!'),
      cabinetType: 'manufacturer',
      region: 'Buxoro viloyati',
      district: 'Kogon tumani',
      category: 'Gipsokarton va Izolyatsiya',
      rating: 4.98,
      status: 'active',
      contractNumber: 'KNF-2026-22',
      commissionRate: 1.5,
      commissionBasis: 'total',
    },
  });

  const chilonzorStore = await prisma.supplier.create({
    data: {
      inn: '305112233',
      companyName: 'Bunker Chilonzor Distribyutori',
      name: 'Ulugbek',
      surname: 'Toirov',
      phone: '+998974445566',
      login: 'bunker_chilonzor',
      passwordHash: seedHash('Partner2026!'),
      cabinetType: 'partner',
      region: 'Toshkent shahri',
      district: 'Chilonzor tumani',
      category: 'Qurilish mollari',
      rating: 4.85,
      status: 'active',
      contractNumber: 'BKR-D-01',
      commissionRate: 2.0,
      commissionBasis: 'total',
    },
  });

  const samarkandStore = await prisma.supplier.create({
    data: {
      inn: '306998877',
      companyName: 'Samarqand Grand Stroy MCHJ',
      name: 'Jahongir',
      surname: 'Samadov',
      phone: '+998985556677',
      login: 'samarqand_stroy',
      passwordHash: seedHash('Partner2026!'),
      cabinetType: 'partner',
      region: 'Samarqand viloyati',
      district: 'Samarqand shahri',
      category: 'Qurilish mollari',
      rating: 4.8,
      status: 'active',
      contractNumber: 'SGS-2026-15',
      commissionRate: 2.0,
      commissionBasis: 'total',
    },
  });

  console.log('🏭 Created 5 verified accredited suppliers and factories.');

  // 4. Products (Authentic Uzbek construction items)
  const productsData = [
    {
      title: 'Ohangaron M500 D0 Sement (50 kg qopda)',
      category: 'Sement va Qorishmalar',
      price: 68000,
      originalPrice: 72000,
      costPrice: 59000,
      initialStock: 3000,
      stock: 2850,
      unit: 'qop (50kg)',
      supplierId: ohangaronFactory.id,
      supplierInn: ohangaronFactory.inn,
      supplierName: ohangaronFactory.companyName,
      supplierCabinetType: 'manufacturer',
      minOrder: 10,
      energyEfficiencyRating: 'Standart',
      isEscoCertified: false,
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=800',
      images: [
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=800',
      ],
      description: 'Ohangaron Sement AJ tomonidan ishlab chiqarilgan yuqori mustahkamlikdagi M500 D0 markali portlandsement. Monolit va poydevor quyish uchun ideal.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Toshkent viloyati',
      salesCount: 420,
      viewsCount: 3120,
      hasDelivery: true,
      hasBonus: true,
      bonusDescription: '100 qopdan ortiq xarid qilinsa, bepul tushirib berish kafolatlangan.',
    },
    {
      title: 'Armatura A500C Ø 12 mm (Bekobod Kombinat)',
      category: 'Metallurgiya & Armatura',
      price: 9200000,
      originalPrice: 9500000,
      costPrice: 8700000,
      initialStock: 200,
      stock: 145,
      unit: 'tonna',
      supplierId: bekobodFactory.id,
      supplierInn: bekobodFactory.inn,
      supplierName: bekobodFactory.companyName,
      supplierCabinetType: 'manufacturer',
      minOrder: 1,
      energyEfficiencyRating: 'Standart',
      isEscoCertified: false,
      image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=800'],
      description: 'O‘zmetkombinat A500C sifatli sovuqqa chidamli payvandlanuvchi armatura. GOST 52544-2006 standartlariga to‘liq javob beradi.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Toshkent viloyati',
      salesCount: 88,
      viewsCount: 1950,
      hasDelivery: true,
      hasBonus: false,
    },
    {
      title: 'Armatura A500C Ø 16 mm (Bekobod Kombinat)',
      category: 'Metallurgiya & Armatura',
      price: 9150000,
      originalPrice: 9400000,
      costPrice: 8650000,
      initialStock: 150,
      stock: 110,
      unit: 'tonna',
      supplierId: bekobodFactory.id,
      supplierInn: bekobodFactory.inn,
      supplierName: bekobodFactory.companyName,
      supplierCabinetType: 'manufacturer',
      minOrder: 1,
      energyEfficiencyRating: 'Standart',
      isEscoCertified: false,
      image: 'https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&q=80&w=800'],
      description: 'Og‘ir poydevor va karkas konstruksiyalari uchun mo‘ljallangan mustahkam 16 mm po‘lat armatura.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Toshkent viloyati',
      salesCount: 64,
      viewsCount: 1420,
      hasDelivery: true,
      hasBonus: false,
    },
    {
      title: 'Avtoklav Gazoblok D500 (600x300x200 mm)',
      category: "G'isht va Bloklar",
      price: 820000,
      originalPrice: 860000,
      costPrice: 710000,
      initialStock: 500,
      stock: 420,
      unit: 'm³',
      supplierId: chilonzorStore.id,
      supplierInn: chilonzorStore.inn,
      supplierName: chilonzorStore.companyName,
      supplierCabinetType: 'partner',
      minOrder: 5,
      energyEfficiencyRating: 'A+',
      isEscoCertified: true,
      image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=800'],
      description: 'Avtoklavda quritilgan issiqlikni saqlovchi ekologik gazoblok. Qishda issiq, yozda salqin saqlaydi va energiya sarfini 40% ga kamaytiradi.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Toshkent shahri',
      salesCount: 115,
      viewsCount: 2840,
      hasDelivery: true,
      hasBonus: true,
      bonusDescription: '15 m³ dan ortiq zakazlarga maxsus kley bepul.',
    },
    {
      title: "Pishgan qizil g'isht M150 (Standart)",
      category: "G'isht va Bloklar",
      price: 1450,
      originalPrice: 1600,
      costPrice: 1100,
      initialStock: 100000,
      stock: 75000,
      unit: 'dona',
      supplierId: samarkandStore.id,
      supplierInn: samarkandStore.inn,
      supplierName: samarkandStore.companyName,
      supplierCabinetType: 'partner',
      minOrder: 1000,
      energyEfficiencyRating: 'Standart',
      isEscoCertified: false,
      image: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&q=80&w=800'],
      description: 'Standart o‘lchamdagi baquvvat pishgan qizil g‘isht. Bino devorlari va to‘siqlari uchun bardoshli material.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Samarqand viloyati',
      salesCount: 22000,
      viewsCount: 4500,
      hasDelivery: true,
      hasBonus: false,
    },
    {
      title: 'Knauf Gipsokarton namga chidamli (GKLV 12.5mm)',
      category: 'Gipsokarton va Izolyatsiya',
      price: 54000,
      originalPrice: 58000,
      costPrice: 46000,
      initialStock: 2000,
      stock: 1650,
      unit: 'dona',
      supplierId: knaufFactory.id,
      supplierInn: knaufFactory.inn,
      supplierName: knaufFactory.companyName,
      supplierCabinetType: 'manufacturer',
      minOrder: 10,
      energyEfficiencyRating: 'A',
      isEscoCertified: true,
      image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=800'],
      description: 'Knauf original yashil namga chidamli gipsokarton listi. Oshxona, vanna va nam xonalar devorlarini tekislash uchun.',
      repairType: 'ichki',
      itemType: 'material',
      region: 'Buxoro viloyati',
      salesCount: 380,
      viewsCount: 2190,
      hasDelivery: true,
      hasBonus: false,
    },
    {
      title: 'Bazalt plita Ekover 50 mm (Energo-tejamkor)',
      category: 'Gipsokarton va Izolyatsiya',
      price: 185000,
      originalPrice: 205000,
      costPrice: 155000,
      initialStock: 800,
      stock: 620,
      unit: 'qop (50kg)',
      supplierId: knaufFactory.id,
      supplierInn: knaufFactory.inn,
      supplierName: knaufFactory.companyName,
      supplierCabinetType: 'manufacturer',
      minOrder: 5,
      energyEfficiencyRating: 'A++',
      isEscoCertified: true,
      image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800'],
      description: 'Yong‘inga chidamli tosh paxta (bazalt plita). Bino tomi va fasadini to‘liq issiqlik hamda shovqindan himoya qiladi.',
      repairType: 'tashqi',
      itemType: 'material',
      region: 'Buxoro viloyati',
      salesCount: 175,
      viewsCount: 1670,
      hasDelivery: true,
      hasBonus: true,
      bonusDescription: 'Energotejamkor dastur bo‘yicha 10% keshbek imkoniyati.',
    },
    {
      title: 'Yuvilgan daryo qumi (Yuqori toza)',
      category: "Qum va Shag'al",
      price: 110000,
      originalPrice: 125000,
      costPrice: 80000,
      initialStock: 1000,
      stock: 850,
      unit: 'tonna',
      supplierId: chilonzorStore.id,
      supplierInn: chilonzorStore.inn,
      supplierName: chilonzorStore.companyName,
      supplierCabinetType: 'partner',
      minOrder: 10,
      energyEfficiencyRating: 'Standart',
      isEscoCertified: false,
      image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800',
      images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800'],
      description: 'Toshkent daryo bo‘yi maxsus yuvilgan loy va changsiz qum. Beton va sifatli qorishmalar uchun eng maqbul xomashyo.',
      repairType: 'universal',
      itemType: 'material',
      region: 'Toshkent shahri',
      salesCount: 92,
      viewsCount: 890,
      hasDelivery: true,
      hasBonus: false,
    },
  ];

  for (const prod of productsData) {
    await prisma.product.create({
      data: {
        ...prod,
        authorId: adminUser.id,
      },
    });
  }

  console.log(`🧱 Seeded ${productsData.length} core construction materials with real specs.`);

  // 5. Logistics Fleet
  const fleetData = [
    {
      name: 'HOWO Samosval 25t (Toshkent)',
      type: 'samosval',
      capacityTons: 25.0,
      pricePerKm: 18000,
      basePrice: 250000,
      driverName: 'Jamshid Rahimov',
      phone: '+998901112233',
      currentLocation: 'Toshkent, Sergeli',
      available: true,
      image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=800',
    },
    {
      name: 'Kamaz Beton Mikser 9m³',
      type: 'mikser',
      capacityTons: 20.0,
      pricePerKm: 22000,
      basePrice: 350000,
      driverName: 'Otabek Umarov',
      phone: '+998934445566',
      currentLocation: 'Ohangaron trassasi',
      available: true,
      image: 'https://images.unsplash.com/photo-1580901368919-4716266921b7?auto=format&fit=crop&q=80&w=800',
    },
    {
      name: 'Isuzu Kran-Manipulyator 5t',
      type: 'kran_manipulyator',
      capacityTons: 5.0,
      pricePerKm: 15000,
      basePrice: 200000,
      driverName: 'Sardor Alimov',
      phone: '+998947778899',
      currentLocation: 'Samarqand shahri',
      available: true,
      image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=800',
    },
    {
      name: 'Gazel Next Bortli 2.5t',
      type: 'gazel',
      capacityTons: 2.5,
      pricePerKm: 8000,
      basePrice: 120000,
      driverName: 'Nodirbek Yusupov',
      phone: '+998991234567',
      currentLocation: 'Toshkent, Chilonzor',
      available: true,
      image: 'https://images.unsplash.com/photo-1586191582056-a6b1070e6c6b?auto=format&fit=crop&q=80&w=800',
    },
  ];

  for (const vehicle of fleetData) {
    await prisma.logisticsVehicle.create({ data: vehicle });
  }

  console.log(`🚚 Seeded ${fleetData.length} heavy logistics vehicles.`);

  // 6. Sample Orders with 50/50 Escrow
  const sampleProduct = await prisma.product.findFirst({ where: { title: { contains: 'Ohangaron' } } });
  if (sampleProduct) {
    const totalOrderSum = sampleProduct.price * 20; // 1,360,000 UZS
    const order = await prisma.order.create({
      data: {
        buyerId: customerUser.id,
        buyerName: customerUser.displayName,
        buyerPhone: customerUser.phone || '+998935001122',
        totalAmount: totalOrderSum,
        status: 'confirmed',
        deliveryAddress: 'Toshkent sh., Yunusobod tumani, 14-mavze, 22-uy',
        deliveryRegion: 'Toshkent shahri',
        deliveryDistrict: 'Yunusobod tumani',
        paymentMethod: 'escrow',
        paymentStatus: 'paid',
        escrowMode: 'split_50_50',
        escrowFirstPart: totalOrderSum * 0.5,
        escrowSecondPart: totalOrderSum * 0.5,
        vehicleType: 'gazel',
        items: {
          create: [
            {
              productId: sampleProduct.id,
              title: sampleProduct.title,
              quantity: 20,
              unit: sampleProduct.unit,
              price: sampleProduct.price,
              totalSum: totalOrderSum,
              supplierId: sampleProduct.supplierId,
              supplierInn: sampleProduct.supplierInn,
              supplierName: sampleProduct.supplierName,
              category: sampleProduct.category,
            },
          ],
        },
      },
    });

    console.log(`📦 Seeded sample escrow order: #${order.id.slice(0, 8)} (${totalOrderSum} UZS)`);
  }

  // 7. CRM Nasiya Daftari (Debt book record for partner store)
  await prisma.crmDebtRecord.create({
    data: {
      supplierId: chilonzorStore.id,
      supplierInn: chilonzorStore.inn,
      supplierCompanyName: chilonzorStore.companyName,
      customerName: 'Akrom Qodirov (Usta)',
      customerPhone: '+998909876543',
      itemsJson: JSON.stringify([
        { title: 'Ohangaron Sement M500', quantity: 25, price: 68000, total: 1700000 },
        { title: 'Armatura Ø12 mm', quantity: 200, unit: 'metr', price: 11000, total: 2200000 },
      ]),
      totalOrderAmount: 3900000,
      initialPaidAmount: 900000,
      debtAmount: 3000000,
      paidDebtAmount: 0,
      remainingDebtAmount: 3000000,
      status: 'pending',
      note: 'Obyekt topshirilganda to‘liq yopiladi, muddat: 15 kun.',
    },
  });

  console.log('📖 Seeded CRM Nasiya record.');

  // 8. Audit Log
  await prisma.systemLog.create({
    data: {
      action: 'SYSTEM_DATABASE_INITIALIZED',
      actor: 'system_seed',
      category: 'system',
      details: 'PostgreSQL database bunkers_db initialized with authentic catalog, factories, and escrow rules.',
      level: 'info',
    },
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
