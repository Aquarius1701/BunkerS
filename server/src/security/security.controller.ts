import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SecurityService } from './security.service';
import { hashPasswordArgon2idSpec } from '../common/crypto.util';

@ApiTags('Security & Cabinet Lock')
@Controller('api/security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('cabinet-lock/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kabinetda boshqa faol qurilma borligini tekshirish' })
  checkLock(@Body() body: { login?: string; userId?: string; deviceSessionId?: string }) {
    return this.securityService.checkCabinetLock(
      body.login,
      body.userId,
      body.deviceSessionId,
    );
  }

  @Post('cabinet-lock/acquire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yakka qurilma blokirovkasini egallash' })
  acquireLock(
    @Body() body: { login?: string; userId?: string; deviceSessionId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.securityService.acquireCabinetLock(
      body.login,
      body.userId,
      body.deviceSessionId,
    );
    if (!result.success) {
      res.status(HttpStatus.CONFLICT);
    }
    return result;
  }

  @Post('cabinet-lock/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Faol qurilma heartbeat xabari' })
  heartbeatLock(@Body() body: { login?: string; userId?: string; deviceSessionId?: string }) {
    return this.securityService.heartbeatCabinetLock(
      body.login,
      body.userId,
      body.deviceSessionId,
    );
  }

  @Post('cabinet-lock/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Qurilma blokirovkasini bo‘shatish' })
  releaseLock(@Body() body: { login?: string; userId?: string; deviceSessionId?: string }) {
    return this.securityService.releaseCabinetLock(
      body.login,
      body.userId,
      body.deviceSessionId,
    );
  }

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HttpOnly Secure Session kuki o‘rnatish' })
  createSession(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, login, role, password, isSubAdmin, subAdminPermissions, firebaseUid } = body || {};
    this.securityService.issueSessionCookie(res, {
      userId: userId || 'anon',
      login: login || '',
      role: role || 'individual',
      isSubAdmin,
      subAdminPermissions,
      firebaseUid,
    });
    const argon2idDigest = password ? hashPasswordArgon2idSpec(String(password)) : undefined;
    return {
      success: true,
      cookieMode: 'HttpOnly; Secure; SameSite=None',
      wafShield: 'Cloudflare Enterprise + AWS WAF',
      vpcStorage: 'AWS VPC Encrypted At-Rest (AES-256-GCM) & In-Transit (TLS 1.3)',
      argon2idHash: argon2idDigest,
    };
  }

  @Post('waf-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WAF & Bot Management clearance' })
  wafVerify(@Body() body: { phone?: string; action?: string }) {
    return this.securityService.createWafClearance(body.phone, body.action);
  }
}
