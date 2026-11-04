import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import {
  encryptAtRestAES256GCM,
  hashPasswordArgon2idSpec,
} from '../common/crypto.util';
import { encodeProtobufBase64 } from '../../../src/lib/protobufCodec';

export interface ActiveCabinetSessionLock {
  cabinetKey: string;
  userId: string;
  login: string;
  deviceSessionId: string;
  lastHeartbeat: number;
}

@Injectable()
export class SecurityService {
  private readonly activeCabinetLocks = new Map<string, ActiveCabinetSessionLock>();
  private readonly CABINET_LOCK_TTL_MS = 35 * 1000; // 35 soniya

  private cleanupExpiredCabinetLocks() {
    const now = Date.now();
    for (const [key, lock] of this.activeCabinetLocks.entries()) {
      if (now - lock.lastHeartbeat > this.CABINET_LOCK_TTL_MS) {
        this.activeCabinetLocks.delete(key);
      }
    }
  }

  public checkCabinetLock(login?: string, userId?: string, deviceSessionId?: string) {
    this.cleanupExpiredCabinetLocks();
    const normLogin = String(login || '').trim().toLowerCase();
    const normUserId = String(userId || '').trim();
    const currentDevice = String(deviceSessionId || '').trim();

    for (const lock of this.activeCabinetLocks.values()) {
      const sameCabinet =
        (normLogin && lock.login === normLogin) ||
        (normUserId && lock.userId && lock.userId === normUserId);
      if (sameCabinet && lock.deviceSessionId !== currentDevice) {
        return {
          locked: true,
          message:
            "Ushbu kabinetda hozirda boshqa qurilma faol! Kabinet ichkarisida foydalanuvchi bo‘lgan vaqtda boshqa qurilma orqali kirish amalga oshirilmaydi.",
        };
      }
    }
    return { locked: false };
  }

  public acquireCabinetLock(login?: string, userId?: string, deviceSessionId?: string) {
    this.cleanupExpiredCabinetLocks();
    const normLogin = String(login || '').trim().toLowerCase();
    const normUserId = String(userId || '').trim();
    const currentDevice = String(deviceSessionId || '').trim();
    const key = normUserId || normLogin;
    if (!key || !currentDevice) {
      return { success: true, locked: false };
    }

    for (const [k, lock] of this.activeCabinetLocks.entries()) {
      const sameCabinet =
        k === key ||
        (normLogin && lock.login === normLogin) ||
        (normUserId && lock.userId && lock.userId === normUserId);
      if (sameCabinet && lock.deviceSessionId !== currentDevice) {
        return {
          success: false,
          locked: true,
          message:
            "Ushbu kabinetda hozirda boshqa qurilma faol! Kabinet ichkarisida foydalanuvchi bo‘lgan vaqtda boshqa qurilma orqali kirish amalga oshirilmaydi.",
        };
      }
    }

    this.activeCabinetLocks.set(key, {
      cabinetKey: key,
      userId: normUserId,
      login: normLogin,
      deviceSessionId: currentDevice,
      lastHeartbeat: Date.now(),
    });
    return { success: true, locked: false };
  }

  public heartbeatCabinetLock(login?: string, userId?: string, deviceSessionId?: string) {
    this.cleanupExpiredCabinetLocks();
    const normLogin = String(login || '').trim().toLowerCase();
    const normUserId = String(userId || '').trim();
    const currentDevice = String(deviceSessionId || '').trim();
    const key = normUserId || normLogin;
    if (!key || !currentDevice) {
      return { success: true };
    }

    const existing = this.activeCabinetLocks.get(key);
    if (!existing || existing.deviceSessionId === currentDevice) {
      this.activeCabinetLocks.set(key, {
        cabinetKey: key,
        userId: normUserId,
        login: normLogin,
        deviceSessionId: currentDevice,
        lastHeartbeat: Date.now(),
      });
    }
    return { success: true };
  }

  public releaseCabinetLock(login?: string, userId?: string, deviceSessionId?: string) {
    const normLogin = String(login || '').trim().toLowerCase();
    const normUserId = String(userId || '').trim();
    const currentDevice = String(deviceSessionId || '').trim();

    for (const [k, lock] of this.activeCabinetLocks.entries()) {
      const sameCabinet =
        (normLogin && lock.login === normLogin) ||
        (normUserId && lock.userId && lock.userId === normUserId);
      if (sameCabinet && (!currentDevice || lock.deviceSessionId === currentDevice)) {
        this.activeCabinetLocks.delete(k);
      }
    }
    return { success: true };
  }

  public issueSessionCookie(res: any, payload: {
    userId: string;
    login: string;
    role: string;
    isSubAdmin?: boolean;
    subAdminPermissions?: string[];
    firebaseUid?: string;
  }) {
    const protoSessionPayload = encodeProtobufBase64({
      userId: payload.userId || 'anon',
      login: payload.login || '',
      role: payload.role || 'individual',
      isSubAdmin: Boolean(payload.isSubAdmin),
      subAdminPermissions: Array.isArray(payload.subAdminPermissions) ? payload.subAdminPermissions : [],
      firebaseUid: payload.firebaseUid || '',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      jti: crypto.randomBytes(16).toString('hex'),
    });
    const encryptedToken = encryptAtRestAES256GCM(protoSessionPayload);
    res.cookie('bs_httponly_token', encryptedToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return encryptedToken;
  }

  public createWafClearance(phone?: string, action?: string) {
    const rayId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const clearanceToken = encryptAtRestAES256GCM(
      encodeProtobufBase64({
        phone: phone || '',
        action: action || 'challenge_clear',
        rayId,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        threatScore: 0,
        botStatus: 'verified_human',
      }),
    );
    return {
      success: true,
      verified: true,
      rayId,
      clearanceToken,
      wafStatus: 'CHALLENGE_SOLVED',
    };
  }
}
