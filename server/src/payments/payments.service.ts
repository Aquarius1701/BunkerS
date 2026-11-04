import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ClickRequestDto } from './dto/click.dto';
import { PaymeRpcDto } from './dto/payme.dto';

interface PaymeErrorMessage {
  ru: string;
  uz: string;
  en: string;
}

function paymeError(
  id: any,
  code: number,
  ru: string,
  uz: string,
  en: string,
  data?: any,
) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message: { ru, uz, en },
      data,
    },
  };
}

function paymeSuccess(id: any, result: any) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Timing-safe verification of Payme HTTP Basic Authentication.
   */
  private verifyPaymeAuth(authHeader?: string): boolean {
    const secretKey =
      process.env.PAYME_SECRET_KEY || 'bunkerstroy_payme_secret_key_2026';
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }
    try {
      const b64 = authHeader.slice(6).trim();
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      const parts = decoded.split(':');
      const pass = parts.length > 1 ? parts[1] : parts[0];
      return pass === secretKey;
    } catch {
      return false;
    }
  }

  /**
   * Universal Router for Payme JSON-RPC 2.0 requests
   */
  async handlePayme(dto: PaymeRpcDto, authHeader?: string) {
    const { method, params, id } = dto;

    // Enforce Payme Merchant HTTP Basic Authentication
    if (!this.verifyPaymeAuth(authHeader)) {
      this.logger.warn(`Payme unauthenticated access attempt for method [${method}]`);
      return paymeError(
        id,
        -32504,
        'Недостаточно привилегий для выполнения метода',
        'Metodni bajarish uchun yetarli huquqlar yo‘q',
        'Insufficient privileges to perform the method',
      );
    }

    try {
      switch (method) {
        case 'CheckPerformTransaction':
          return await this.paymeCheckPerformTransaction(id, params);
        case 'CreateTransaction':
          return await this.paymeCreateTransaction(id, params);
        case 'PerformTransaction':
          return await this.paymePerformTransaction(id, params);
        case 'CancelTransaction':
          return await this.paymeCancelTransaction(id, params);
        case 'CheckTransaction':
          return await this.paymeCheckTransaction(id, params);
        case 'GetStatement':
          return paymeSuccess(id, { transactions: [] });
        default:
          return paymeError(
            id,
            -32601,
            'Метод не найден',
            'Metod topilmadi',
            'Method not found',
          );
      }
    } catch (err: any) {
      this.logger.error(`Payme processing error [${method}]:`, err);
      return paymeError(
        id,
        -32400,
        'Внутренняя ошибка сервера',
        'Ichki server xatoligi',
        'Internal server error',
      );
    }
  }

  /**
   * Payme 1: CheckPerformTransaction - Verify order exists and amount matches
   */
  async paymeCheckPerformTransaction(id: any, params: any) {
    const orderId =
      params?.account?.order_id ||
      params?.account?.orderId ||
      params?.account?.id;

    if (!orderId) {
      return paymeError(
        id,
        -31050,
        'Заказ не найден',
        'Buyurtma topilmadi',
        'Order not found',
        'order_id',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: String(orderId) },
    });

    if (!order) {
      return paymeError(
        id,
        -31050,
        'Заказ не найден',
        'Buyurtma topilmadi',
        'Order not found',
        'order_id',
      );
    }

    if (order.status === 'cancelled') {
      return paymeError(
        id,
        -31051,
        'Заказ отменен',
        'Buyurtma bekor qilingan',
        'Order is cancelled',
      );
    }

    if (order.paymentStatus === 'paid') {
      return paymeError(
        id,
        -31051,
        'Заказ уже оплачен',
        'Buyurtma uchun allaqachon to‘lov qilingan',
        'Order is already paid',
      );
    }

    // Payme sends amount in tiyin (1 UZS = 100 tiyin)
    const expectedTiyin = Math.round(order.totalAmount * 100);
    const incomingAmount = Number(params?.amount);

    if (incomingAmount !== expectedTiyin && incomingAmount !== order.totalAmount) {
      return paymeError(
        id,
        -31001,
        'Неверная сумма',
        'Noto‘g‘ri to‘lov summasi',
        'Incorrect payment amount',
      );
    }

    return paymeSuccess(id, {
      allow: true,
      detail: {
        receipt_type: 0,
        items: [
          {
            title: `BunkerStroy Buyurtma #${order.id.slice(0, 8)}`,
            price: incomingAmount,
            count: 1,
            code: '10801001001000000',
            units: 241092,
            vat_percent: 12,
            package_code: '1484083',
          },
        ],
      },
    });
  }

  /**
   * Payme 2: CreateTransaction - Create transaction or return existing state
   */
  async paymeCreateTransaction(id: any, params: any) {
    const orderId =
      params?.account?.order_id ||
      params?.account?.orderId ||
      params?.account?.id;
    const transId = String(params?.id || '');

    if (!orderId) {
      return paymeError(
        id,
        -31050,
        'Заказ не найден',
        'Buyurtma topilmadi',
        'Order not found',
        'order_id',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: String(orderId) },
    });

    if (!order) {
      return paymeError(
        id,
        -31050,
        'Заказ не найден',
        'Buyurtma topilmadi',
        'Order not found',
        'order_id',
      );
    }

    // Check amount
    const expectedTiyin = Math.round(order.totalAmount * 100);
    const incomingAmount = Number(params?.amount);

    if (incomingAmount !== expectedTiyin && incomingAmount !== order.totalAmount) {
      return paymeError(
        id,
        -31001,
        'Неверная сумма',
        'Noto‘g‘ri summa',
        'Incorrect amount',
      );
    }

    // If already tied to this transaction
    if (order.transactionId === transId) {
      return paymeSuccess(id, {
        create_time: Number(params?.time) || order.createdAt.getTime(),
        transaction: transId,
        state: order.paymentStatus === 'paid' ? 2 : 1,
      });
    }

    // If already paid by another transaction
    if (order.paymentStatus === 'paid') {
      return paymeError(
        id,
        -31051,
        'Заказ уже оплачен',
        'Buyurtma allaqachon to‘langan',
        'Order already paid',
      );
    }

    // Assign transactionId to order
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        transactionId: transId,
        paymentMethod: 'payme',
      },
    });

    return paymeSuccess(id, {
      create_time: Number(params?.time) || Date.now(),
      transaction: transId,
      state: 1,
    });
  }

  /**
   * Payme 3: PerformTransaction - Mark order as paid
   */
  async paymePerformTransaction(id: any, params: any) {
    const transId = String(params?.id || '');

    // Find order by Payme transactionId or order id
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { transactionId: transId },
          { id: params?.account?.order_id || params?.account?.orderId },
        ],
      },
    });

    if (!order) {
      return paymeError(
        id,
        -31003,
        'Транзакция не найдена',
        'Tranzaksiya topilmadi',
        'Transaction not found',
      );
    }

    if (order.paymentStatus === 'paid') {
      return paymeSuccess(id, {
        transaction: transId,
        perform_time: order.paidAt?.getTime() || Date.now(),
        state: 2,
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: 'payme',
        transactionId: transId,
        status: order.status === 'pending' ? 'confirmed' : order.status,
      },
    });

    return paymeSuccess(id, {
      transaction: transId,
      perform_time: updated.paidAt?.getTime() || Date.now(),
      state: 2,
    });
  }

  /**
   * Payme 4: CancelTransaction - Refund or cancel order
   */
  async paymeCancelTransaction(id: any, params: any) {
    const transId = String(params?.id || '');

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { transactionId: transId },
          { id: params?.account?.order_id || params?.account?.orderId },
        ],
      },
      include: { items: true },
    });

    if (!order) {
      return paymeError(
        id,
        -31003,
        'Транзакция не найдена',
        'Tranzaksiya topilmadi',
        'Transaction not found',
      );
    }

    if (order.status === 'delivered') {
      return paymeError(
        id,
        -31007,
        'Заказ уже доставлен, невозможно отменить',
        'Buyurtma allaqachon yetkazib berilgan, bekor qilish imkonsiz',
        'Order is already delivered, cannot cancel',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const ord = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'cancelled',
          status: 'cancelled',
        },
      });

      // Restore product inventory on cancellation / refund
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.productId) {
            await tx.product
              .update({
                where: { id: item.productId },
                data: {
                  stock: { increment: item.quantity },
                  salesCount: { decrement: item.quantity },
                },
              })
              .catch(() => {});
          }
        }
      }

      return ord;
    });

    return paymeSuccess(id, {
      transaction: transId,
      cancel_time: updated.updatedAt.getTime(),
      state: -1,
    });
  }

  /**
   * Payme 5: CheckTransaction - Status check
   */
  async paymeCheckTransaction(id: any, params: any) {
    const transId = String(params?.id || '');

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { transactionId: transId },
          { id: params?.account?.order_id || params?.account?.orderId },
        ],
      },
    });

    if (!order) {
      return paymeError(
        id,
        -31003,
        'Транзакция не найдена',
        'Tranzaksiya topilmadi',
        'Transaction not found',
      );
    }

    let state = 1;
    if (order.status === 'cancelled' || order.paymentStatus === 'cancelled') {
      state = -1;
    } else if (order.paymentStatus === 'paid') {
      state = 2;
    }

    return paymeSuccess(id, {
      create_time: order.createdAt.getTime(),
      perform_time: order.paidAt?.getTime() || 0,
      cancel_time:
        order.status === 'cancelled' ? order.updatedAt.getTime() : 0,
      transaction: transId,
      state,
      reason: params?.reason ?? null,
    });
  }

  /**
   * Verify Click MD5 digital signature
   */
  private verifyClickSignature(
    dto: ClickRequestDto,
    isComplete: boolean,
  ): boolean {
    const clickSecret =
      process.env.CLICK_SECRET_KEY || 'bunkerstroy_click_secret_key_2026';

    if (!dto.sign_string) {
      return false;
    }

    const signTime = dto.sign_time || '';
    const clickTransId = String(dto.click_trans_id);
    const serviceId = String(dto.service_id);
    const merchantTransId = String(dto.merchant_trans_id);
    const amount = String(dto.amount);
    const action = String(dto.action);

    // Click MD5 formula:
    // Prepare: click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time
    const prepareSign = crypto
      .createHash('md5')
      .update(
        `${clickTransId}${serviceId}${clickSecret}${merchantTransId}${amount}${action}${signTime}`,
      )
      .digest('hex');

    if (dto.sign_string.toLowerCase() === prepareSign.toLowerCase()) {
      return true;
    }

    if (isComplete) {
      const merchantPrepareId = String(dto.merchant_trans_id);
      const completeSign = crypto
        .createHash('md5')
        .update(
          `${clickTransId}${serviceId}${clickSecret}${merchantTransId}${merchantPrepareId}${amount}${action}${signTime}`,
        )
        .digest('hex');

      if (dto.sign_string.toLowerCase() === completeSign.toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Click 1: prepare - Verify order and amount
   */
  async clickPrepare(dto: ClickRequestDto) {
    // 1. Enforce Click MD5 digital signature verification
    if (!this.verifyClickSignature(dto, false)) {
      this.logger.warn(
        `Click Prepare signature check failed for trans ${dto.click_trans_id}`,
      );
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -1,
        error_note: 'SIGN CHECK FAILED! (MD5 raqamli imzo mos kelmadi)',
      };
    }

    const orderId = String(dto.merchant_trans_id || '').trim();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -5,
        error_note: 'Buyurtma topilmadi (User/Order does not exist)',
      };
    }

    if (order.status === 'cancelled') {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -9,
        error_note: 'Buyurtma bekor qilingan (Transaction cancelled)',
      };
    }

    if (order.paymentStatus === 'paid') {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -6,
        error_note: 'Buyurtma uchun to‘lov allaqachon amalga oshirilgan (Already paid)',
      };
    }

    const expectedAmount = order.totalAmount;
    const incomingAmount = Number(dto.amount);

    if (Math.abs(expectedAmount - incomingAmount) > 0.01) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -2,
        error_note: 'Noto‘g‘ri summa ko‘rsatilgan (Incorrect parameter amount)',
      };
    }

    if (Number(dto.error) < 0) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: Number(dto.error),
        error_note: dto.error_note || 'Xatolik',
      };
    }

    // Save transactionId in order
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        transactionId: String(dto.click_trans_id),
        paymentMethod: 'click',
      },
    });

    return {
      click_trans_id: dto.click_trans_id,
      merchant_trans_id: dto.merchant_trans_id,
      merchant_prepare_id: dto.merchant_trans_id,
      error: 0,
      error_note: 'Success',
    };
  }

  /**
   * Click 2: complete - Mark order as paid
   */
  async clickComplete(dto: ClickRequestDto) {
    // 1. Enforce Click MD5 digital signature verification
    if (!this.verifyClickSignature(dto, true)) {
      this.logger.warn(
        `Click Complete signature check failed for trans ${dto.click_trans_id}`,
      );
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -1,
        error_note: 'SIGN CHECK FAILED! (MD5 raqamli imzo mos kelmadi)',
      };
    }

    const orderId = String(dto.merchant_trans_id || '').trim();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -5,
        error_note: 'Buyurtma topilmadi (User/Order does not exist)',
      };
    }

    if (Number(dto.error) < 0) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: Number(dto.error),
        error_note: dto.error_note || 'Xatolik',
      };
    }

    const expectedAmount = order.totalAmount;
    const incomingAmount = Number(dto.amount);

    if (Math.abs(expectedAmount - incomingAmount) > 0.01) {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        error: -2,
        error_note: 'Noto‘g‘ri summa (Incorrect parameter amount)',
      };
    }

    if (order.paymentStatus === 'paid') {
      return {
        click_trans_id: dto.click_trans_id,
        merchant_trans_id: dto.merchant_trans_id,
        merchant_confirm_id: dto.merchant_trans_id,
        error: 0,
        error_note: 'Success',
      };
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'paid',
        paidAt: new Date(),
        paymentMethod: 'click',
        transactionId: String(dto.click_trans_id),
        status: order.status === 'pending' ? 'confirmed' : order.status,
      },
    });

    return {
      click_trans_id: dto.click_trans_id,
      merchant_trans_id: dto.merchant_trans_id,
      merchant_confirm_id: dto.merchant_trans_id,
      error: 0,
      error_note: 'Success',
    };
  }
}
