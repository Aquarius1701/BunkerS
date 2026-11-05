import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPasswordArgon2idSpec } from '../common/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

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
        status: true,
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

    const { passwordHash, emergencyPasswordHash, ...safeSupplier } = supplier;

    return {
      success: true,
      data: safeSupplier,
    };
  }

  async create(dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        OR: [
          { inn: dto.inn },
          ...(dto.login ? [{ login: dto.login }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.inn === dto.inn) {
        throw new ConflictException(`Ushbu STIR (${dto.inn}) bo‘yicha ta’minotchi allaqachon mavjud`);
      }
      throw new ConflictException(`Ushbu login (${dto.login}) allaqachon band`);
    }

    const generatedLogin = dto.login?.trim() || `supp_${dto.inn}`;
    const plainPass = dto.password?.trim() || `BunkerPass_${dto.inn}!`;
    const passwordHash = hashPasswordArgon2idSpec(plainPass);

    const supplier = await this.prisma.supplier.create({
      data: {
        companyName: dto.companyName.trim(),
        inn: dto.inn.trim(),
        cabinetType: dto.cabinetType,
        phone: dto.phone.trim(),
        secondaryPhone: dto.secondaryPhone?.trim() || null,
        region: dto.region.trim(),
        district: dto.district?.trim() || null,
        category: dto.category?.trim() || 'Qurilish mollari',
        login: generatedLogin,
        passwordHash,
        status: dto.status || 'active',
        contractNumber: dto.contractNumber?.trim() || `CTR-${Date.now().toString(36).toUpperCase()}`,
        commissionRate: dto.commissionRate !== undefined ? Number(dto.commissionRate) : 1.5,
        commissionBasis: dto.commissionBasis || 'total',
      },
    });

    const { passwordHash: _p, emergencyPasswordHash: _e, ...safeSupplier } = supplier;

    return {
      success: true,
      message: 'Yetkazib beruvchi kabineti muvaffaqiyatli yaratildi',
      data: safeSupplier,
    };
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha yetkazib beruvchi topilmadi`);
    }

    const data: Prisma.SupplierUpdateInput = {};
    if (dto.companyName) data.companyName = dto.companyName.trim();
    if (dto.cabinetType) data.cabinetType = dto.cabinetType;
    if (dto.phone) data.phone = dto.phone.trim();
    if (dto.secondaryPhone !== undefined) data.secondaryPhone = dto.secondaryPhone?.trim() || null;
    if (dto.region) data.region = dto.region.trim();
    if (dto.district !== undefined) data.district = dto.district?.trim() || null;
    if (dto.category) data.category = dto.category.trim();
    if (dto.status) data.status = dto.status;
    if (dto.contractNumber) data.contractNumber = dto.contractNumber.trim();
    if (dto.commissionRate !== undefined) data.commissionRate = Number(dto.commissionRate);
    if (dto.commissionBasis) data.commissionBasis = dto.commissionBasis;
    if (dto.password) data.passwordHash = hashPasswordArgon2idSpec(dto.password.trim());

    const updated = await this.prisma.supplier.update({
      where: { id },
      data,
    });

    const { passwordHash: _p, emergencyPasswordHash: _e, ...safeSupplier } = updated;

    return {
      success: true,
      message: 'Yetkazib beruvchi ma’lumotlari muvaffaqiyatli yangilandi',
      data: safeSupplier,
    };
  }

  async updateStatus(id: string, status: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha yetkazib beruvchi topilmadi`);
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        companyName: true,
        inn: true,
        cabinetType: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: `Yetkazib beruvchi holati '${status}' ga o‘zgartirildi`,
      data: updated,
    };
  }

  async delete(id: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha yetkazib beruvchi topilmadi`);
    }

    await this.prisma.supplier.delete({ where: { id } });

    return {
      success: true,
      message: 'Yetkazib beruvchi muvaffaqiyatli o‘chirildi',
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
