import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { PayDebtDto } from './dto/pay-debt.dto';
import { QueryDebtDto } from './dto/query-debt.dto';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async getDebts(query: QueryDebtDto) {
    const where: Prisma.CrmDebtRecordWhereInput = {};

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.status && (query.status === 'pending' || query.status === 'paid')) {
      where.status = query.status;
    }

    if (query.search && query.search.trim() !== '') {
      const searchTerm = query.search.trim();
      where.OR = [
        { customerName: { contains: searchTerm, mode: 'insensitive' } },
        { customerPhone: { contains: searchTerm } },
      ];
    }

    const debts = await this.prisma.crmDebtRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: debts,
    };
  }

  async createDebt(dto: CreateDebtDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { id: true, companyName: true, inn: true },
    });

    if (!supplier) {
      throw new NotFoundException(`ID '${dto.supplierId}' bo‘yicha do‘kon topilmadi`);
    }

    const total = Number(dto.totalOrderAmount);
    const initial = Number(dto.initialPaidAmount) || 0;
    const debt = Math.max(0, total - initial);
    const isFullyPaid = debt === 0;

    const record = await this.prisma.crmDebtRecord.create({
      data: {
        supplierId: supplier.id,
        supplierInn: supplier.inn,
        supplierCompanyName: supplier.companyName,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        itemsJson: typeof dto.items === 'string' ? dto.items : JSON.stringify(dto.items || []),
        totalOrderAmount: total,
        initialPaidAmount: initial,
        debtAmount: debt,
        remainingDebtAmount: debt,
        status: isFullyPaid ? 'paid' : 'pending',
        note: dto.note || null,
        paidAt: isFullyPaid ? new Date() : null,
      },
    });

    return {
      success: true,
      message: 'Nasiya daftarga yangi yozuv muvaffaqiyatli saqlandi',
      data: record,
    };
  }

  async recordPayment(id: string, dto: PayDebtDto) {
    const paymentAmount = Number(dto.amount);
    if (!paymentAmount || paymentAmount <= 0) {
      throw new BadRequestException('To‘lov summasi musbat bo‘lishi shart');
    }

    const { updated, newRemainingDebt, isFullyPaid } =
      await this.prisma.$transaction(async (tx) => {
        const record = await tx.crmDebtRecord.findUnique({
          where: { id },
        });

        if (!record) {
          throw new NotFoundException(
            `ID '${id}' bo‘yicha nasiya yozuvi topilmadi`,
          );
        }

        const remaining = Math.max(
          0,
          record.remainingDebtAmount - paymentAmount,
        );
        const fullyPaid = remaining <= 0;

        const res = await tx.crmDebtRecord.update({
          where: { id },
          data: {
            paidDebtAmount: { increment: paymentAmount },
            remainingDebtAmount: remaining,
            status: fullyPaid ? 'paid' : 'pending',
            paidAt: fullyPaid ? new Date() : record.paidAt,
          },
        });

        return {
          updated: res,
          newRemainingDebt: remaining,
          isFullyPaid: fullyPaid,
        };
      });

    return {
      success: true,
      message: isFullyPaid
        ? 'Qarz to‘liq yopildi!'
        : `${paymentAmount.toLocaleString()} so‘m to‘landi. Qolgan qarz: ${newRemainingDebt.toLocaleString()} so‘m`,
      data: updated,
    };
  }
}
