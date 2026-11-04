import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getProducts(req: Request, res: Response): Promise<void> {
  try {
    const {
      category,
      search,
      supplierId,
      region,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      order = 'desc',
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where: any = {};

    if (category && typeof category === 'string' && category !== 'Hammasi') {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
        { supplierName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    if (supplierId && typeof supplierId === 'string') {
      where.supplierId = supplierId;
    }

    if (region && typeof region === 'string') {
      where.region = { contains: region, mode: 'insensitive' };
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    const orderBy: any = {};
    if (sortBy === 'price_asc') {
      orderBy.price = 'asc';
    } else if (sortBy === 'price_desc') {
      orderBy.price = 'desc';
    } else if (sortBy === 'popular') {
      orderBy.salesCount = 'desc';
    } else {
      orderBy[sortBy as string] = order === 'asc' ? 'asc' : 'desc';
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
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
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: take,
        total: totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: 'Mahsulotlarni yuklashda xatolik yuz berdi' });
  }
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
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
      res.status(404).json({ success: false, error: 'Mahsulot topilmadi' });
      return;
    }

    // Increment view count asynchronously
    prisma.product.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    }).catch((err) => console.error('Failed to increment views:', err));

    res.json({ success: true, data: product });
  } catch (error: any) {
    console.error('Error fetching product by id:', error);
    res.status(500).json({ success: false, error: 'Mahsulot ma\'lumotlarini yuklashda xatolik' });
  }
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const {
      title,
      category,
      price,
      originalPrice,
      costPrice,
      unit = 'dona',
      stock = 100,
      minOrder = 1,
      image,
      images = [],
      description,
      repairType = 'universal',
      itemType = 'material',
      supplierId,
      supplierInn,
      supplierName,
      supplierCabinetType,
      energyEfficiencyRating = 'Standart',
      isEscoCertified = false,
      region,
      hasDelivery = true,
      hasBonus = false,
      bonusDescription,
    } = req.body;

    if (!title || !price || !category || !image) {
      res.status(400).json({
        success: false,
        error: 'Majburiy maydonlar: title, price, category, image to\'ldirilishi shart',
      });
      return;
    }

    const created = await prisma.product.create({
      data: {
        title,
        category,
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : parseFloat(price),
        costPrice: costPrice ? parseFloat(costPrice) : null,
        unit,
        stock: parseInt(stock, 10) || 100,
        initialStock: parseInt(stock, 10) || 100,
        minOrder: parseInt(minOrder, 10) || 1,
        image,
        images: Array.isArray(images) && images.length > 0 ? images : [image],
        description: description || '',
        repairType,
        itemType,
        supplierId: supplierId || null,
        supplierInn: supplierInn || null,
        supplierName: supplierName || 'Bunker Partner',
        supplierCabinetType: supplierCabinetType || 'partner',
        energyEfficiencyRating,
        isEscoCertified: Boolean(isEscoCertified),
        region: region || null,
        hasDelivery: Boolean(hasDelivery),
        hasBonus: Boolean(hasBonus),
        bonusDescription: bonusDescription || null,
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, error: 'Mahsulotni qo\'shishda xatolik' });
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData: any = { ...req.body };

    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.originalPrice) updateData.originalPrice = parseFloat(updateData.originalPrice);
    if (updateData.stock !== undefined) updateData.stock = parseInt(updateData.stock, 10);
    if (updateData.minOrder !== undefined) updateData.minOrder = parseInt(updateData.minOrder, 10);

    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, error: 'Mahsulotni tahrirlashda xatolik' });
  }
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.product.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Mahsulot muvaffaqiyatli o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, error: 'Mahsulotni o\'chirishda xatolik' });
  }
}

export async function getCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await prisma.product.groupBy({
      by: ['category'],
      _count: {
        id: true,
      },
    });

    const formatted = categories.map((c) => ({
      name: c.category,
      count: c._count.id,
    }));

    res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: 'Kategoriyalarni yuklashda xatolik' });
  }
}
