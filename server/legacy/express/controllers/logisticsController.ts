import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getVehicles(req: Request, res: Response): Promise<void> {
  try {
    const { type, available } = req.query;

    const where: any = {};
    if (type && typeof type === 'string') {
      where.type = type;
    }
    if (available !== undefined) {
      where.available = available === 'true';
    }

    const vehicles = await prisma.logisticsVehicle.findMany({
      where,
      orderBy: { capacityTons: 'desc' },
    });

    res.json({ success: true, data: vehicles });
  } catch (error: any) {
    console.error('Error fetching logistics fleet:', error);
    res.status(500).json({ success: false, error: 'Logistika transportlarini yuklashda xatolik' });
  }
}

export async function calculateFreightCost(req: Request, res: Response): Promise<void> {
  try {
    const { vehicleType = 'samosval', distanceKm = 10, totalWeightTons = 1 } = req.body;

    const distance = Math.max(1, parseFloat(distanceKm) || 1);
    const weight = Math.max(0.1, parseFloat(totalWeightTons) || 1);

    const vehicle = await prisma.logisticsVehicle.findFirst({
      where: {
        type: vehicleType,
        available: true,
      },
      orderBy: { basePrice: 'asc' },
    });

    const basePrice = vehicle ? vehicle.basePrice : 200000;
    const pricePerKm = vehicle ? vehicle.pricePerKm : 15000;

    const freightTotal = basePrice + (pricePerKm * distance);
    const estimatedMinutes = Math.round(distance * 3 + 20); // 3 mins per km + 20 min loading

    res.json({
      success: true,
      data: {
        vehicleType,
        vehicleName: vehicle ? vehicle.name : 'Standart Yuk Mashinasi',
        capacityTons: vehicle ? vehicle.capacityTons : 20,
        distanceKm: distance,
        totalWeightTons: weight,
        basePrice,
        pricePerKm,
        totalFreightCost: Math.round(freightTotal),
        estimatedDurationMinutes: estimatedMinutes,
        driverContact: vehicle ? { name: vehicle.driverName, phone: vehicle.phone } : null,
      },
    });
  } catch (error: any) {
    console.error('Error calculating freight cost:', error);
    res.status(500).json({ success: false, error: 'Yetkazib berish narxini hisoblashda xatolik' });
  }
}
