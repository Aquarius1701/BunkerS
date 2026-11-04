import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  role: string;
  phone?: string | null;
  displayName?: string | null;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        'bunkerstroy-enterprise-jwt-super-secret-key-2026',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token ma’lumotlari yaroqsiz');
    }

    // 1. Check User in Prisma
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (user) {
      if (user.status === 'blocked') {
        throw new UnauthorizedException('Foydalanuvchi akkaunti bloklangan');
      }
      const { passwordHash: _, ...safeUser } = user;
      return safeUser;
    }

    // 2. Check Supplier in Prisma if not found in User
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        OR: [{ id: payload.sub }, { userId: payload.sub }],
      },
    });

    if (supplier) {
      if (supplier.status === 'blocked') {
        throw new UnauthorizedException('Ta’minotchi akkaunti bloklangan');
      }
      const {
        passwordHash: _p,
        emergencyPasswordHash: _e,
        contractPdfData: _c,
        ...safeSupplier
      } = supplier;
      return {
        ...safeSupplier,
        role: 'supplier',
        displayName: supplier.companyName || supplier.name || supplier.login,
      };
    }

    throw new UnauthorizedException(
      'Foydalanuvchi topilmadi yoki token eskirgan',
    );
  }
}
