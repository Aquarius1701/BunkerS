import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getSuppliers(req: Request, res: Response): Promise<void> {
  try {
    const { cabinetType, region, search, category } = req.query;

    const where: any = { status: 'active' };

    if (cabinetType && (cabinetType === 'manufacturer' || cabinetType === 'partner')) {
      where.cabinetType = cabinetType;
    }

    if (region && typeof region === 'string') {
      where.region = { contains: region, mode: 'insensitive' };
    }

    if (category && typeof category === 'string' && category !== 'Hammasi') {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { companyName: { contains: search.trim(), mode: 'insensitive' } },
        { inn: { contains: search.trim() } },
        { region: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        cabinetType: true,
        inn: true,
        category: true,
        region: true,
        district: true,
        phone: true,
        rating: true,
        contractNumber: true,
        commissionRate: true,
        commissionBasis: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: { rating: 'desc' },
    });

    res.json({ success: true, data: suppliers });
  } catch (error: any) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ success: false, error: 'Yetkazib beruvchilarni yuklashda xatolik' });
  }
}

export async function getSupplierById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          take: 50,
          orderBy: { salesCount: 'desc' },
        },
      },
    });

    if (!supplier) {
      res.status(404).json({ success: false, error: 'Yetkazib beruvchi topilmadi' });
      return;
    }

    // Omit sensitive hashes
    const { passwordHash, emergencyPasswordHash, ...safeSupplier } = supplier;

    res.json({ success: true, data: safeSupplier });
  } catch (error: any) {
    console.error('Error fetching supplier by id:', error);
    res.status(500).json({ success: false, error: 'Kompaniya ma\'lumotlarini olishda xatolik' });
  }
}

export async function getSupplierStats(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const [productsCount, totalOrderItems, debts] = await Promise.all([
      prisma.product.count({ where: { supplierId: id } }),
      prisma.orderItem.findMany({
        where: { supplierId: id },
        select: { totalSum: true, quantity: true },
      }),
      prisma.crmDebtRecord.aggregate({
        where: { supplierId: id },
        _sum: { remainingDebtAmount: true, totalOrderAmount: true },
      }),
    ]);

    const totalRevenue = totalOrderItems.reduce((acc, item) => acc + item.totalSum, 0);
    const totalUnitsSold = totalOrderItems.reduce((acc, item) => acc + item.quantity, 0);

    res.json({
      success: true,
      data: {
        productsCount,
        totalRevenue,
        totalUnitsSold,
        totalOutstandingDebt: debts._sum.remainingDebtAmount || 0,
        totalDebtOrdersValue: debts._sum.totalOrderAmount || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching supplier stats:', error);
    res.status(500).json({ success: false, error: 'Statistika yuklashda xatolik' });
  }
}
