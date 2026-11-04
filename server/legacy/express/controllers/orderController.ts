import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const {
      buyerId,
      buyerName,
      buyerPhone,
      deliveryAddress,
      deliveryRegion,
      deliveryDistrict,
      deliveryStreet,
      deliveryLandmark,
      recipientName,
      recipientPhone,
      paymentMethod = 'escrow',
      escrowMode = 'split_50_50',
      vehicleType = 'samosval',
      items,
      orderChannel = 'online',
    } = req.body;

    if (!buyerName || !buyerPhone || !deliveryAddress || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Xaridor ismi, telefon raqami, yetkazish manzili va mahsulotlar to\'liq kiritilishi shart',
      });
      return;
    }

    // Resolve or create user if buyerId is missing or synthetic
    let verifiedBuyerId = buyerId;
    if (!verifiedBuyerId || verifiedBuyerId === 'guest') {
      const existingUser = await prisma.user.findFirst({
        where: { phone: buyerPhone },
      });
      if (existingUser) {
        verifiedBuyerId = existingUser.id;
      } else {
        const newUser = await prisma.user.create({
          data: {
            displayName: buyerName,
            phone: buyerPhone,
            role: 'customer',
            userType: 'individual',
            address: deliveryAddress,
            region: deliveryRegion || 'Toshkent shahri',
          },
        });
        verifiedBuyerId = newUser.id;
      }
    }

    // Calculate total amount
    let calculatedTotal = 0;
    const validatedItems: any[] = [];

    for (const item of items) {
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      const price = parseFloat(item.price);
      const totalSum = price * quantity;
      calculatedTotal += totalSum;

      validatedItems.push({
        productId: item.productId || item.id || null,
        title: item.title,
        quantity,
        unit: item.unit || 'dona',
        price,
        totalSum,
        category: item.category || 'Qurilish mollari',
        supplierId: item.supplierId || null,
        supplierInn: item.supplierInn || null,
        supplierName: item.supplierName || 'Bunker Partner',
      });
    }

    const isSplitEscrow = escrowMode === 'split_50_50';
    const firstPart = isSplitEscrow ? calculatedTotal * 0.5 : calculatedTotal;
    const secondPart = isSplitEscrow ? calculatedTotal * 0.5 : 0;

    // Run transaction: create order + order items and decrement stock
    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          buyerId: verifiedBuyerId,
          buyerName,
          buyerPhone,
          deliveryAddress,
          deliveryRegion: deliveryRegion || null,
          deliveryDistrict: deliveryDistrict || null,
          deliveryStreet: deliveryStreet || null,
          deliveryLandmark: deliveryLandmark || null,
          recipientName: recipientName || buyerName,
          recipientPhone: recipientPhone || buyerPhone,
          paymentMethod,
          escrowMode,
          escrowFirstPart: firstPart,
          escrowSecondPart: secondPart,
          vehicleType,
          totalAmount: calculatedTotal,
          status: 'confirmed',
          paymentStatus: 'paid', // Escrow hold
          orderChannel,
          items: {
            create: validatedItems,
          },
        },
        include: {
          items: true,
        },
      });

      // Update product stocks & sales counts
      for (const item of validatedItems) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
              salesCount: { increment: item.quantity },
            },
          }).catch((err) => console.warn('Non-fatal stock update warning:', err.message));
        }
      }

      return order;
    });

    res.status(201).json({
      success: true,
      message: 'Buyurtma va 50/50 kafolatlangan Eskrou to\'lovi muvaffaqiyatli rasmiylashtirildi',
      data: createdOrder,
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, error: 'Buyurtmani rasmiylashtirishda xatolik yuz berdi' });
  }
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const { buyerId, status, supplierId, page = '1', limit = '30' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
    const skip = (pageNum - 1) * take;

    const where: any = {};
    if (buyerId && typeof buyerId === 'string') {
      where.buyerId = buyerId;
    }
    if (status && typeof status === 'string' && status !== 'all') {
      where.status = status;
    }
    if (supplierId && typeof supplierId === 'string') {
      where.items = {
        some: {
          supplierId,
        },
      };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    console.error('Error getting orders:', error);
    res.status(500).json({ success: false, error: 'Buyurtmalarni yuklashda xatolik' });
  }
}

export async function getOrderById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
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
      res.status(404).json({ success: false, error: 'Buyurtma topilmadi' });
      return;
    }

    res.json({ success: true, data: order });
  } catch (error: any) {
    console.error('Error getting order by id:', error);
    res.status(500).json({ success: false, error: 'Buyurtma tafsilotlarini olishda xatolik' });
  }
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, driverName, driverPhone } = req.body;

    const validStatuses = ['pending', 'confirmed', 'assigned', 'in_transit', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: 'Noto\'g\'ri buyurtma holati' });
      return;
    }

    const updatePayload: any = { status };
    if (driverName) updatePayload.driverName = driverName;
    if (driverPhone) updatePayload.driverPhone = driverPhone;

    const updated = await prisma.order.update({
      where: { id },
      data: updatePayload,
      include: { items: true },
    });

    res.json({
      success: true,
      message: `Buyurtma holati yangilandi: ${status}`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, error: 'Buyurtma holatini yangilashda xatolik' });
  }
}
