import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateFreightDto } from './dto/calculate-freight.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

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

  async createVehicle(dto: CreateVehicleDto) {
    const vehicle = await this.prisma.logisticsVehicle.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        capacityTons: Number(dto.capacityTons),
        pricePerKm: Number(dto.pricePerKm),
        basePrice: Number(dto.basePrice),
        available: dto.available !== undefined ? dto.available : true,
        driverName: dto.driverName.trim(),
        phone: dto.phone.trim(),
        currentLocation: dto.currentLocation.trim(),
        image: dto.image?.trim() || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=600&auto=format&fit=crop&q=80',
      },
    });

    return {
      success: true,
      message: 'Logistika texnikasi muvaffaqiyatli qo‘shildi',
      data: vehicle,
    };
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto) {
    const existing = await this.prisma.logisticsVehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha transport vositasi topilmadi`);
    }

    const data: Prisma.LogisticsVehicleUpdateInput = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.type) data.type = dto.type;
    if (dto.capacityTons !== undefined) data.capacityTons = Number(dto.capacityTons);
    if (dto.pricePerKm !== undefined) data.pricePerKm = Number(dto.pricePerKm);
    if (dto.basePrice !== undefined) data.basePrice = Number(dto.basePrice);
    if (dto.available !== undefined) data.available = dto.available;
    if (dto.driverName) data.driverName = dto.driverName.trim();
    if (dto.phone) data.phone = dto.phone.trim();
    if (dto.currentLocation) data.currentLocation = dto.currentLocation.trim();
    if (dto.image) data.image = dto.image.trim();

    const updated = await this.prisma.logisticsVehicle.update({
      where: { id },
      data,
    });

    return {
      success: true,
      message: 'Transport vositasi ma’lumotlari yangilandi',
      data: updated,
    };
  }

  async deleteVehicle(id: string) {
    const existing = await this.prisma.logisticsVehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID '${id}' bo‘yicha transport vositasi topilmadi`);
    }

    await this.prisma.logisticsVehicle.delete({ where: { id } });

    return {
      success: true,
      message: 'Transport vositasi muvaffaqiyatli o‘chirildi',
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
    const estimatedMinutes = Math.round(distance * 3 + 20);

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
