import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';

export async function getDebts(req: Request, res: Response): Promise<void> {
  try {
    const { supplierId, status, search } = req.query;

    const where: any = {};
    if (supplierId && typeof supplierId === 'string') {
      where.supplierId = supplierId;
    }
    if (status && (status === 'pending' || status === 'paid')) {
      where.status = status;
    }
    if (search && typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { customerName: { contains: search.trim(), mode: 'insensitive' } },
        { customerPhone: { contains: search.trim() } },
      ];
    }

    const debts = await prisma.crmDebtRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: debts });
  } catch (error: any) {
    console.error('Error fetching debts:', error);
    res.status(500).json({ success: false, error: 'Nasiya daftari ma\'lumotlarini olishda xatolik' });
  }
}

export async function createDebt(req: Request, res: Response): Promise<void> {
  try {
    const {
      supplierId,
      customerName,
      customerPhone,
      items,
      totalOrderAmount,
      initialPaidAmount = 0,
      note,
    } = req.body;

    if (!supplierId || !customerName || !customerPhone || !totalOrderAmount) {
      res.status(400).json({
        success: false,
        error: 'Majburiy maydonlar: Do\'kon (supplierId), mijoz ismi, telefon va umumiy summa kiritilishi shart',
      });
      return;
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, companyName: true, inn: true },
    });

    if (!supplier) {
      res.status(404).json({ success: false, error: 'Do\'kon topilmadi' });
      return;
    }

    const total = parseFloat(totalOrderAmount);
    const initial = parseFloat(initialPaidAmount) || 0;
    const debt = Math.max(0, total - initial);

    const record = await prisma.crmDebtRecord.create({
      data: {
        supplierId: supplier.id,
        supplierInn: supplier.inn,
        supplierCompanyName: supplier.companyName,
        customerName,
        customerPhone,
        itemsJson: typeof items === 'string' ? items : JSON.stringify(items || []),
        totalOrderAmount: total,
        initialPaidAmount: initial,
        debtAmount: debt,
        remainingDebtAmount: debt,
        status: debt === 0 ? 'paid' : 'pending',
        note: note || null,
        paidAt: debt === 0 ? new Date() : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Nasiya daftarga yangi yozuv muvaffaqiyatli saqlandi',
      data: record,
    });
  } catch (error: any) {
    console.error('Error creating debt record:', error);
    res.status(500).json({ success: false, error: 'Nasiyani saqlashda xatolik yuz berdi' });
  }
}

export async function recordDebtPayment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      res.status(400).json({ success: false, error: 'To\'lov summasi musbat son bo\'lishi shart' });
      return;
    }

    const record = await prisma.crmDebtRecord.findUnique({
      where: { id },
    });

    if (!record) {
      res.status(404).json({ success: false, error: 'Nasiya yozuvi topilmadi' });
      return;
    }

    const newPaidDebt = record.paidDebtAmount + paymentAmount;
    const newRemainingDebt = Math.max(0, record.remainingDebtAmount - paymentAmount);
    const isFullyPaid = newRemainingDebt <= 0;

    const updated = await prisma.crmDebtRecord.update({
      where: { id },
      data: {
        paidDebtAmount: newPaidDebt,
        remainingDebtAmount: newRemainingDebt,
        status: isFullyPaid ? 'paid' : 'pending',
        paidAt: isFullyPaid ? new Date() : record.paidAt,
      },
    });

    res.json({
      success: true,
      message: isFullyPaid
        ? 'Qarz to\'liq yopildi!'
        : `${paymentAmount.toLocaleString()} so'm to'landi. Qolgan qarz: ${newRemainingDebt.toLocaleString()} so'm`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Error recording debt payment:', error);
    res.status(500).json({ success: false, error: 'Qarz to\'lovini qayd etishda xatolik' });
  }
}
