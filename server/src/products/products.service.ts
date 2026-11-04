import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryProductDto) {
    const pageNum = Math.max(1, query.page || 1);
    const take = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (pageNum - 1) * take;

    const where: Prisma.ProductWhereInput = {};

    if (query.category && query.category !== 'Hammasi') {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { supplierName: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.region) {
      where.region = { contains: query.region, mode: 'insensitive' };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    if (query.sortBy === 'price_asc') {
      orderBy.price = 'asc';
    } else if (query.sortBy === 'price_desc') {
      orderBy.price = 'desc';
    } else if (query.sortBy === 'popular') {
      orderBy.salesCount = 'desc';
    } else if (query.sortBy) {
      (orderBy as Record<string, Prisma.SortOrder>)[query.sortBy] = query.order === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [products, totalCount] = await Promise.all([
      this.prisma.product.findMany({
        where,
        take,
        skip,
        orderBy,
        include: {
          supplier: {
            select: {
              id: true,
              companyName: true,
              inn: true,
              rating: true,
              region: true,
              cabinetType: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: take,
        total: totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            inn: true,
            rating: true,
            region: true,
            phone: true,
            cabinetType: true,
          },
        },
        variants: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`ID '${id}' bo‘yicha mahsulot topilmadi`);
    }

    // Increment views count asynchronously
    this.prisma.product
      .update({
        where: { id },
        data: { viewsCount: { increment: 1 } },
      })
      .catch((err) => console.error('Failed to increment product views:', err));

    return {
      success: true,
      data: product,
    };
  }

  async create(dto: CreateProductDto) {
    const created = await this.prisma.product.create({
      data: {
        title: dto.title,
        category: dto.category,
        price: dto.price,
        originalPrice: dto.originalPrice ?? dto.price,
        costPrice: dto.costPrice ?? null,
        unit: dto.unit || 'dona',
        stock: dto.stock ?? 100,
        initialStock: dto.stock ?? 100,
        minOrder: dto.minOrder ?? 1,
        image: dto.image,
        images: dto.images && dto.images.length > 0 ? dto.images : [dto.image],
        description: dto.description || '',
        repairType: dto.repairType || 'universal',
        itemType: dto.itemType || 'material',
        supplierId: dto.supplierId || null,
        supplierInn: dto.supplierInn || null,
        supplierName: dto.supplierName || 'Bunker Partner',
        supplierCabinetType: dto.supplierCabinetType || 'partner',
        energyEfficiencyRating: dto.energyEfficiencyRating || 'Standart',
        isEscoCertified: Boolean(dto.isEscoCertified),
        region: dto.region || null,
        district: dto.district || null,
        hasDelivery: dto.hasDelivery !== undefined ? Boolean(dto.hasDelivery) : true,
        hasBonus: Boolean(dto.hasBonus),
        bonusDescription: dto.bonusDescription || null,
        bonusThreshold: dto.bonusThreshold ?? null,
        bonusAmount: dto.bonusAmount ?? null,
      },
    });

    return {
      success: true,
      data: created,
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha tahrirlanuvchi mahsulot topilmadi`);
    }

    const {
      title,
      category,
      price,
      originalPrice,
      costPrice,
      unit,
      stock,
      minOrder,
      image,
      images,
      description,
      repairType,
      itemType,
      supplierId,
      supplierInn,
      supplierName,
      supplierCabinetType,
      energyEfficiencyRating,
      isEscoCertified,
      region,
      district,
      hasDelivery,
      hasBonus,
      bonusDescription,
      bonusThreshold,
      bonusAmount,
    } = dto;

    const data: Prisma.ProductUpdateInput = {};

    if (title !== undefined) data.title = title;
    if (category !== undefined) data.category = category;
    if (price !== undefined) data.price = price;
    if (originalPrice !== undefined) data.originalPrice = originalPrice;
    if (costPrice !== undefined) data.costPrice = costPrice;
    if (unit !== undefined) data.unit = unit;
    if (stock !== undefined) data.stock = stock;
    if (minOrder !== undefined) data.minOrder = minOrder;
    if (image !== undefined) data.image = image;
    if (images !== undefined) data.images = images;
    if (description !== undefined) data.description = description;
    if (repairType !== undefined) data.repairType = repairType;
    if (itemType !== undefined) data.itemType = itemType;
    if (supplierId !== undefined) {
      data.supplier = supplierId ? { connect: { id: supplierId } } : { disconnect: true };
    }
    if (supplierInn !== undefined) data.supplierInn = supplierInn;
    if (supplierName !== undefined) data.supplierName = supplierName;
    if (supplierCabinetType !== undefined) data.supplierCabinetType = supplierCabinetType;
    if (energyEfficiencyRating !== undefined) data.energyEfficiencyRating = energyEfficiencyRating;
    if (isEscoCertified !== undefined) data.isEscoCertified = isEscoCertified;
    if (region !== undefined) data.region = region;
    if (district !== undefined) data.district = district;
    if (hasDelivery !== undefined) data.hasDelivery = hasDelivery;
    if (hasBonus !== undefined) data.hasBonus = hasBonus;
    if (bonusDescription !== undefined) data.bonusDescription = bonusDescription;
    if (bonusThreshold !== undefined) data.bonusThreshold = bonusThreshold;
    if (bonusAmount !== undefined) data.bonusAmount = bonusAmount;

    const updated = await this.prisma.product.update({
      where: { id },
      data,
    });

    return {
      success: true,
      data: updated,
    };
  }

  async delete(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha o‘chiriluvchi mahsulot topilmadi`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Mahsulot muvaffaqiyatli o‘chirildi',
    };
  }

  async getCategories() {
    const categories = await this.prisma.product.groupBy({
      by: ['category'],
      _count: {
        id: true,
      },
    });

    const formatted = categories.map((c) => ({
      name: c.category,
      count: c._count.id,
    }));

    return {
      success: true,
      data: formatted,
    };
  }
}
