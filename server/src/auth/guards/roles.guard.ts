import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException(
        'Ushbu amalni bajarish uchun avtorizatsiyadan o‘tish talab qilinadi',
      );
    }

    // Platform administration roles have unrestricted access
    if (user.role === 'admin' || user.role === 'bunker_admin') {
      return true;
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Ruxsat berilmagan: sizning rolingiz (${user.role}) ushbu amalni bajarish huquqiga ega emas`,
      );
    }

    return true;
  }
}
