import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    // 1. Resolve or create user if buyerId is missing or guest
    let verifiedBuyerId = dto.buyerId;
    if (!verifiedBuyerId || verifiedBuyerId === 'guest') {
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: dto.buyerPhone },
      });

      if (existingUser) {
        verifiedBuyerId = existingUser.id;
      } else {
        const newUser = await this.prisma.user.create({
          data: {
            displayName: dto.buyerName,
            phone: dto.buyerPhone,
            role: 'customer',
            userType: 'individual',
            address: dto.deliveryAddress,
            region: dto.deliveryRegion || 'Toshkent shahri',
          },
        });
        verifiedBuyerId = newUser.id;
      }
    }

    // 2. Calculate item totals with database price verification & inventory check
    let calculatedTotal = 0;
    const validatedItems: {
      productId: string | null;
      title: string;
      quantity: number;
      unit: string;
      price: number;
      totalSum: number;
      category: string;
      supplierId: string | null;
      supplierInn: string | null;
      supplierName: string;
    }[] = [];

    for (const item of dto.items) {
      const quantity = Math.max(1, item.quantity || 1);
      let price = Number(item.price);
      let title = item.title;
      let category = item.category || 'Qurilish mollari';
      let supplierId = item.supplierId || null;
      let supplierInn = item.supplierInn || null;
      let supplierName = item.supplierName || 'Bunker Partner';

      // Server-side authoritative price verification & stock pre-check
      if (item.productId) {
        const dbProduct = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });

        if (dbProduct) {
          if (dbProduct.stock < quantity) {
            throw new BadRequestException(
              `"${dbProduct.title}" mahsulotidan omborda yetarli qoldiq mavjud emas (Mavjud: ${dbProduct.stock}, Talab: ${quantity})`,
            );
          }
          // Enforce authoritative database product price
          price = Number(dbProduct.price);
          title = dbProduct.title;
          category = dbProduct.category || category;
          supplierId = dbProduct.supplierId || supplierId;
        }
      }

      if (price <= 0 || isNaN(price)) {
        throw new BadRequestException(
          `Mahsulot narxi noto‘g‘ri kiritilgan: ${title}`,
        );
      }

      const totalSum = price * quantity;
      calculatedTotal += totalSum;

      validatedItems.push({
        productId: item.productId || null,
        title,
        quantity,
        unit: item.unit || 'dona',
        price,
        totalSum,
        category,
        supplierId,
        supplierInn,
        supplierName,
      });
    }

    // 3. 50/50 Escrow transaction split
    const isSplitEscrow = dto.escrowMode !== 'full_100';
    const escrowFirstPart = isSplitEscrow ? calculatedTotal * 0.5 : calculatedTotal;
    const escrowSecondPart = isSplitEscrow ? calculatedTotal * 0.5 : 0;

    // 4. Prisma transaction: create Order + OrderItems and atomic stock decrement
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          buyerId: verifiedBuyerId!,
          buyerName: dto.buyerName,
          buyerPhone: dto.buyerPhone,
          deliveryAddress: dto.deliveryAddress,
          deliveryRegion: dto.deliveryRegion || null,
          deliveryDistrict: dto.deliveryDistrict || null,
          deliveryStreet: dto.deliveryStreet || null,
          deliveryLandmark: dto.deliveryLandmark || null,
          recipientName: dto.recipientName || dto.buyerName,
          recipientPhone: dto.recipientPhone || dto.buyerPhone,
          paymentMethod: dto.paymentMethod || 'escrow',
          escrowMode: dto.escrowMode || 'split_50_50',
          escrowFirstPart,
          escrowSecondPart,
          vehicleType: dto.vehicleType || 'samosval',
          totalAmount: calculatedTotal,
          status: dto.paymentMethod === 'cash' ? 'confirmed' : 'pending',
          paymentStatus: 'pending', // Awaiting gateway verification or cash settlement
          orderChannel: dto.orderChannel || 'online',
          items: {
            create: validatedItems,
          },
        },
        include: {
          items: true,
        },
      });

      // Atomic inventory deduction with race condition protection
      for (const item of validatedItems) {
        if (item.productId) {
          const res = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
              salesCount: { increment: item.quantity },
            },
          });

          if (res.count === 0) {
            throw new BadRequestException(
              `Omborda "${item.title}" mahsulotidan yetarli qoldiq qolmagan (Boshqa xaridor tomonidan band qilingan)`,
            );
          }
        }
      }

      return order;
    });

    return {
      success: true,
      message: 'Buyurtma muvaffaqiyatli qabul qilindi. To‘lov kutilmoqda.',
      data: createdOrder,
    };
  }

  async findAll(query: QueryOrderDto) {
    const pageNum = Math.max(1, query.page || 1);
    const take = Math.min(100, Math.max(1, query.limit || 30));
    const skip = (pageNum - 1) * take;

    const where: Prisma.OrderWhereInput = {};

    if (query.buyerId) {
      where.buyerId = query.buyerId;
    }

    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }

    if (query.supplierId) {
      where.items = {
        some: {
          supplierId: query.supplierId,
        },
      };
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: orders,
      pagination: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                image: true,
                category: true,
              },
            },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`ID '${id}' bo‘yicha buyurtma topilmadi`);
    }

    return {
      success: true,
      data: order,
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha buyurtma topilmadi`);
    }

    const updatePayload: Prisma.OrderUpdateInput = {
      status: dto.status,
    };

    if (dto.driverName) updatePayload.driverName = dto.driverName;
    if (dto.driverPhone) updatePayload.driverPhone = dto.driverPhone;

    const updated = await this.prisma.order.update({
      where: { id },
      data: updatePayload,
      include: { items: true },
    });

    return {
      success: true,
      message: `Buyurtma holati yangilandi: ${dto.status}`,
      data: updated,
    };
  }
}
