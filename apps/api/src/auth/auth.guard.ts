import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest, IS_PUBLIC } from '../common/auth-context';
import { clientInfo } from '../common/request-context';
import { AccessService } from './access.service';

/**
 * Global authentication guard. Every endpoint requires a valid access token unless marked @Public().
 * The session row is checked on every request (see AccessService).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });
    }
    req.auth = await this.access.authenticate(header.slice(7), clientInfo(req));
    return true;
  }
}
