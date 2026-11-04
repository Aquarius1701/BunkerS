import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateFreightDto } from './dto/calculate-freight.dto';

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVehicles(type?: string, available?: boolean) {
    const where: Prisma.LogisticsVehicleWhereInput = {};

    if (type) {
      where.type = type;
    }

    if (available !== undefined) {
      where.available = available;
    }

    const vehicles = await this.prisma.logisticsVehicle.findMany({
      where,
      orderBy: { capacityTons: 'desc' },
    });

    return {
      success: true,
      data: vehicles,
    };
  }

  async calculateFreight(dto: CalculateFreightDto) {
    const vehicleType = dto.vehicleType || 'samosval';
    const distance = Math.max(1, dto.distanceKm || 10);
    const weight = Math.max(0.1, dto.totalWeightTons || 1);

    const vehicle = await this.prisma.logisticsVehicle.findFirst({
      where: {
        type: vehicleType,
        available: true,
      },
      orderBy: { basePrice: 'asc' },
    });

    const basePrice = vehicle ? vehicle.basePrice : 200000;
    const pricePerKm = vehicle ? vehicle.pricePerKm : 15000;

    const freightTotal = basePrice + pricePerKm * distance;
    const estimatedMinutes = Math.round(distance * 3 + 20); // 3 mins per km + 20 min loading

    return {
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
    };
  }
}
