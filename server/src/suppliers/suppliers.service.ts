import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuerySupplierDto } from './dto/query-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySupplierDto) {
    const where: Prisma.SupplierWhereInput = {
      status: 'active',
    };

    if (query.cabinetType && (query.cabinetType === 'manufacturer' || query.cabinetType === 'partner')) {
      where.cabinetType = query.cabinetType;
    }

    if (query.region && query.region.trim() !== '') {
      where.region = { contains: query.region.trim(), mode: 'insensitive' };
    }

    if (query.category && query.category.trim() !== '' && query.category !== 'Hammasi') {
      where.category = { contains: query.category.trim(), mode: 'insensitive' };
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.OR = [
        { companyName: { contains: searchTerm, mode: 'insensitive' } },
        { inn: { contains: searchTerm } },
        { region: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const suppliers = await this.prisma.supplier.findMany({
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

    return {
      success: true,
      data: suppliers,
    };
  }

  async findById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          take: 50,
          orderBy: { salesCount: 'desc' },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException(`ID '${id}' bo‘yicha yetkazib beruvchi / zavod topilmadi`);
    }

    // Omit sensitive authentication hashes
    const { passwordHash, emergencyPasswordHash, ...safeSupplier } = supplier;

    return {
      success: true,
      data: safeSupplier,
    };
  }

  async getStats(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      select: { id: true, companyName: true },
    });

    if (!supplier) {
      throw new NotFoundException(`ID '${id}' bo‘yicha yetkazib beruvchi topilmadi`);
    }

    const [productsCount, totalOrderItems, debts] = await Promise.all([
      this.prisma.product.count({ where: { supplierId: id } }),
      this.prisma.orderItem.findMany({
        where: { supplierId: id },
        select: { totalSum: true, quantity: true },
      }),
      this.prisma.crmDebtRecord.aggregate({
        where: { supplierId: id },
        _sum: { remainingDebtAmount: true, totalOrderAmount: true },
      }),
    ]);

    const totalRevenue = totalOrderItems.reduce((acc, item) => acc + item.totalSum, 0);
    const totalUnitsSold = totalOrderItems.reduce((acc, item) => acc + item.quantity, 0);

    return {
      success: true,
      data: {
        productsCount,
        totalRevenue,
        totalUnitsSold,
        totalOutstandingDebt: debts._sum.remainingDebtAmount || 0,
        totalDebtOrdersValue: debts._sum.totalOrderAmount || 0,
      },
    };
  }
}
